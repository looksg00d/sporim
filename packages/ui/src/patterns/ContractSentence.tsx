import { buildContractSentence, type ContractSentenceInput } from '@sporim/domain';
import type { CSSProperties } from 'react';
import { color, typeStyle, type TypeToken } from '../tokens';

export interface ContractSentenceProps {
  readonly input: ContractSentenceInput;
  readonly token?: TypeToken;
  readonly style?: CSSProperties;
}

/**
 * The agreement as one sentence, with the money and the names emphasised.
 * The domain builds the parts; this only paints them, so the wording stays testable
 * without a DOM.
 */
export function ContractSentence({ input, token = 'headingMd', style }: ContractSentenceProps) {
  const { parts } = buildContractSentence(input);
  return (
    <p style={{ margin: 0, color: color.ink, textWrap: 'pretty', ...typeStyle(token), ...style }}>
      {parts.map((part, index) => (
        <span key={index} style={part.emphasis ? { color: color.accent } : undefined}>
          {part.text}
        </span>
      ))}
    </p>
  );
}
