import React from 'react';

export default function ProjectsEditor(props: { text: string }) {
  const { text } = props;
  return (
    <div className="relative h-full w-full bg-paper">
      <textarea
        value={text}
        readOnly
        className="w-full h-full p-8 font-mono text-sm md:text-base leading-relaxed resize-none outline-none text-ink bg-transparent selection:bg-yellow-200"
        spellCheck={false}
      />
    </div>
  );
}

