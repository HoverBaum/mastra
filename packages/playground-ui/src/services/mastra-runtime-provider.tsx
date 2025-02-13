'use client';

import {
  useExternalStoreRuntime,
  ThreadMessageLike,
  AppendMessage,
  AssistantRuntimeProvider,
} from '@assistant-ui/react';
import { MastraClient } from '@mastra/client-js';
import { useState, ReactNode, useMemo } from 'react';

const createMastraClient = (url: string) =>
  new MastraClient({
    baseUrl: url || 'http://localhost:4111',
  });

const convertMessage = (message: ThreadMessageLike): ThreadMessageLike => {
  return message;
};

export function MastraRuntimeProvider({
  children,
  agentId,
  url,
}: Readonly<{
  children: ReactNode;
}> & {
  agentId: string;
  url: string;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);

  const mastra = useMemo(() => createMastraClient(url), [url]);

  const onNew = async (message: AppendMessage) => {
    if (message.content[0]?.type !== 'text') throw new Error('Only text messages are supported');

    const input = message.content[0].text;
    setMessages(currentConversation => [...currentConversation, { role: 'user', content: input }]);
    setIsRunning(true);

    try {
      const agent = mastra.getAgent(agentId);
      const response = await agent.stream({
        messages: [
          {
            role: 'user',
            content: input,
          },
        ],
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      let assistantMessage = '';
      let assistantMessageAdded = false;
      let errorMessage = '';

      if (!reader) {
        throw new Error('No reader found');
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          buffer += chunk;

          const matches = buffer.matchAll(/0:"([^"]*)"/g);
          const errorMatches = buffer.matchAll(/3:"([^"]*)"/g);

          if (errorMatches) {
            for (const match of errorMatches) {
              const content = match[1];
              errorMessage += content;
              setMessages(currentConversation => [
                ...currentConversation.slice(0, -1),
                {
                  role: 'assistant',
                  content: [{ type: 'text', text: errorMessage }],
                  isError: true,
                },
              ]);
            }
          }

          for (const match of matches) {
            const content = match[1];
            assistantMessage += content;
            setMessages(currentConversation => {
              const message: ThreadMessageLike = {
                role: 'assistant',
                content: [{ type: 'text', text: assistantMessage }],
              };

              if (!assistantMessageAdded) {
                assistantMessageAdded = true;
                return [...currentConversation, message];
              }
              return [...currentConversation.slice(0, -1), message];
            });
          }
          buffer = '';
        }
      } finally {
        reader.releaseLock();
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Error occured in MastraRuntimeProvider', error);
      setIsRunning(false);
    }
  };

  const runtime = useExternalStoreRuntime<any>({
    isRunning,
    messages,
    convertMessage,
    onNew,
  });

  return <AssistantRuntimeProvider runtime={runtime}> {children} </AssistantRuntimeProvider>;
}
