import { Component, type ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';
import { fonts, palette, space, status } from '../theme/tokens.ts';

// A render error before (or outside) the router would otherwise leave
// a blank window with nothing in any log. Show it instead.
export class BootErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state = { error: undefined as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error === undefined) return this.props.children;
    return <ErrorScreen error={this.state.error} />;
  }
}

/** Router-level error element: same screen, inside the router. */
export function RouteError() {
  return <ErrorScreen error={useRouteError()} />;
}

function ErrorScreen({ error }: { error: unknown }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: space.xl,
        height: '100%',
        boxSizing: 'border-box',
        whiteSpace: 'pre-wrap',
        fontFamily: fonts.mono,
        fontSize: 12,
        color: status.errorText,
        background: palette.ground,
      }}
    >
      {error instanceof Error
        ? (error.stack ?? error.message)
        : String(error)}
    </pre>
  );
}
