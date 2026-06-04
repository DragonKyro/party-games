import { useState, useRef, useEffect } from 'react';
import { useNetworkStore } from '@/platform/store/networkStore';
import './Chat.css';

export function Chat() {
  const chat = useNetworkStore((s) => s.chat);
  const sendChat = useNetworkStore((s) => s.sendChat);
  const myUuid = useNetworkStore((s) => s.myUuid);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat]);

  return (
    <div className="pg-chat">
      <div ref={scrollRef} className="pg-chat-log">
        {chat.length === 0 && (
          <div className="pg-chat-empty">No messages yet.</div>
        )}
        {chat.map((m) => (
          <div
            key={m.id}
            className={
              'pg-chat-msg' +
              (m.kind === 'system' ? ' pg-chat-system' : '') +
              (m.senderUuid === myUuid ? ' pg-chat-mine' : '')
            }
          >
            {m.kind === 'user' && (
              <span className="pg-chat-sender">{m.senderName}</span>
            )}
            <span className="pg-chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      <form
        className="pg-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          sendChat(text);
          setText('');
        }}
      >
        <input
          className="pg-chat-input"
          placeholder="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={400}
        />
      </form>
    </div>
  );
}
