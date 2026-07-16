import { useEffect } from 'react';

interface WelcomeOverlayProps {
    team: 'Red' | 'Blue';
    onDismiss: () => void;
}

/**
 * First-join onboarding: team, objective, controls. Dismissed by the button
 * or the first key press (which is also how you start driving).
 */
export function WelcomeOverlay({ team, onDismiss }: WelcomeOverlayProps) {
    useEffect(() => {
        const onKey = () => onDismiss();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onDismiss]);

    const isRed = team === 'Red';
    const teamColor = isRed ? 'text-red-400' : 'text-blue-400';
    const teamBg = isRed ? 'bg-red-500/20 border-red-400' : 'bg-blue-500/20 border-blue-400';

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 max-w-md rounded-2xl bg-gray-900/95 p-8 text-center text-white shadow-2xl border border-gray-700">
                <h2 className="text-3xl font-bold mb-1">Welcome to Smuggler's Town</h2>
                <div className={`inline-block mt-3 mb-5 px-4 py-1.5 rounded-full border text-lg font-semibold ${teamBg} ${teamColor}`}>
                    You're on team {team.toUpperCase()}
                </div>

                <p className="text-gray-200 mb-5">
                    Grab the 🚽 contraband and haul it back to the{' '}
                    <span className={teamColor}>{isRed ? 'red' : 'blue'} circle</span> — your base.
                    Ram opponents to steal what they're carrying!
                </p>

                <div className="text-sm text-gray-300 space-y-1.5 mb-6 text-left mx-auto w-fit">
                    <div>🚗 Drive with <b>WASD</b> / <b>arrow keys</b> (gamepad works too)</div>
                    <div>🛣️ Roads are <b>2.5× faster</b> than cutting through blocks</div>
                    <div>🏢 Buildings are solid — go around</div>
                    <div>🌊 Water sends you back to the start</div>
                </div>

                <button
                    onClick={onDismiss}
                    className={`px-6 py-2.5 rounded-lg font-semibold text-white shadow-lg transition-transform hover:scale-105 ${isRed ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                >
                    Hit the gas →
                </button>
                <p className="text-gray-500 text-xs mt-3">or press any key to start</p>
            </div>
        </div>
    );
}
