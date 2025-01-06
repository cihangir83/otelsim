import React, { useEffect, useState } from 'react';
import { Sun } from 'lucide-react';
import './DayAnnouncement.css';

const DayAnnouncement = ({ day, isVisible }) => {
    const [sparkles, setSparkles] = useState([]);
    const [shouldFadeOut, setShouldFadeOut] = useState(false);

    useEffect(() => {
        if (isVisible) {
            // Generate random sparkles
            const newSparkles = Array.from({ length: 20 }, (_, i) => ({
                id: i,
                style: {
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 1.5}s`
                }
            }));
            setSparkles(newSparkles);
            setShouldFadeOut(false);

            // Set fade out timing
            const timer = setTimeout(() => {
                setShouldFadeOut(true);
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [isVisible]);

    if (!isVisible) return null;

    return (
        <div className={`day-announcement ${shouldFadeOut ? 'fade-out' : ''}`}>
            <div className="sparkles">
                {sparkles.map((sparkle) => (
                    <div
                        key={sparkle.id}
                        className="sparkle"
                        style={sparkle.style}
                    />
                ))}
            </div>
            <Sun className="sun-icon" />
            <div className="day-content">
                <div className="day-number">{day}</div>
                <div className="day-text">Gün</div>
                <p>Yeni bir gün başlıyor!</p>
            </div>
        </div>
    );
};

export default DayAnnouncement;