import { PillLink, color, space, typeStyle } from '@sporim/ui';

export default function NewBetNotFound() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: space.lg,
        minHeight: '100dvh',
        padding: `${space.xxl}px ${space.lg}px`,
      }}
    >
      <h1 style={{ margin: 0, ...typeStyle('displayMd'), color: color.ink }}>No such step.</h1>
      <p style={{ margin: 0, ...typeStyle('body'), color: color.inkSecondary }}>
        The wizard has five. Start at the first one.
      </p>
      <PillLink href="/new/terms">Start a bet</PillLink>
    </main>
  );
}
