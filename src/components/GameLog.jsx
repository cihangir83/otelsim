import React from 'react';
import { ScrollText } from 'lucide-react';
import './GameLog.css';

const GameLog = ({ logs }) => {
    return (
        <div className="log-container">
            <div className="log-header">
                <ScrollText size={24} className="text-blue-500" />
                <h2 className="text-xl font-semibold">Oyun Günlüğü</h2>
            </div>
            <div className="log-content">
                {logs.map((log, index) => (
                    <div key={index} className="log-entry">
                        <div className="log-day">Gün {log.day}</div>
                        <div className="log-decisions">
                            {log.decisions.map((decision, idx) => (
                                <p key={idx}>{decision}</p>
                            ))}
                            <div className="money-details">
                                {log.moneySpent > 0 && (
                                    <p className="money-spent">Harcanan: ${log.moneySpent.toLocaleString()}</p>
                                )}
                                {log.moneyGained > 0 && (
                                    <p className="money-gained">Kazanılan: ${log.moneyGained.toLocaleString()}</p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GameLog;