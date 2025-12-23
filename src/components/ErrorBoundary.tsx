import React, { Component, ErrorInfo, ReactNode, PropsWithChildren } from 'react';

interface Props extends PropsWithChildren {
    // children is now inherited from PropsWithChildren
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State;
    public props: PropsWithChildren<Props>;

    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
        this.props = props;
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
            errorInfo: null
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
        (this as Component<Props, State>).setState({
            error,
            errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#050505] text-gray-300 p-8">
                    <div className="max-w-4xl mx-auto">
                        <h1 className="text-2xl font-bold text-red-400 mb-4">Erreur de rendu</h1>
                        <div className="bg-[#1a1a1a] border border-red-500/30 rounded-lg p-6 mb-4">
                            <h2 className="text-lg font-semibold mb-2">Message d'erreur :</h2>
                            <pre className="text-sm text-red-300 whitespace-pre-wrap mb-4">
                                {this.state.error?.message || 'Erreur inconnue'}
                            </pre>
                            {this.state.errorInfo && (
                                <>
                                    <h2 className="text-lg font-semibold mb-2">Stack trace :</h2>
                                    <pre className="text-xs text-gray-400 whitespace-pre-wrap overflow-auto max-h-96">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                </>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                (this as Component<Props, State>).setState({ hasError: false, error: null, errorInfo: null });
                                window.location.reload();
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                        >
                            Recharger la page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

