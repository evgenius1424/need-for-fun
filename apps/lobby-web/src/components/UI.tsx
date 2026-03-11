import type { PropsWithChildren } from 'react';
export const ErrorBanner = ({ children }: PropsWithChildren) => <div className="error">{children}</div>;
export const LoadingState = ({ children }: PropsWithChildren) => <div className="loading">{children}</div>;
