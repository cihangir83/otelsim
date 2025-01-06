import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../styles/GameCard.css';

const DemandModal = ({ isOpen, onClose, demands, onAccept, onReject, demandEffects }) => {
    if (!isOpen) return null;

    // Event handlers'a e.stopPropagation() ekleyelim
    const handleAccept = (e) => {
        e.stopPropagation();
        onAccept();
    };

    const handleReject = (e) => {
        e.stopPropagation();
        onReject();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h3 className="modal-title">Müşteri Talepleri</h3>
                <div className="demands-list">
                    {demands.split(',').map((demand, index) => (
                        <p key={index} className="demand-item">• {demand.trim()}</p>
                    ))}
                </div>
                <div className="demands-effects">
                    <div className="accept-effects">
                        <h4>Karşılama Maliyeti:</h4>
                        <p className="money negative">{demandEffects.accept.money}₺</p>
                    </div>
                    <div className="reject-effects">
                        <h4>Reddetme Etkisi:</h4>
                        <p className="satisfaction negative">{demandEffects.reject.satisfaction}% Memnuniyet</p>
                    </div>
                </div>
                <div className="modal-actions">
                    <button
                        className="accept-btn"
                        onClick={handleAccept}  // Güncellendi
                    >
                        Talepleri Karşıla ({demandEffects.accept.money}₺)
                    </button>
                    <button
                        className="reject-btn"
                        onClick={handleReject}  // Güncellendi
                    >
                        Reddet ({demandEffects.reject.satisfaction}% Memnuniyet)
                    </button>
                </div>
                <button className="close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>×</button>
            </div>
        </div>
    );
};

const GameCard = ({
                      type,
                      number,
                      title,
                      description,
                      customerType,
                      income,
                      demands,
                      demandEffects,
                      effects,
                      onSelect,
                      isActive = true,
                      turnNumber
                  }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [isSelected, setIsSelected] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        setIsFlipped(false);
        setIsSelected(false);
    }, [turnNumber]);

    const getHeaderColor = () => {
        switch(type) {
            case 'customer':
                return '#4A90E2';
            case 'crisis':
                return '#e84d4d';
            case 'resource':
                return '#2ecc71';
            default:
                return '#e84d4d';
        }
    };

    const handleClick = () => {
        if (isActive && !isSelected) {
            setIsFlipped(!isFlipped);
        }
    };

    const handleSelect = () => {
        if (isActive && !isSelected && isFlipped) {
            setIsSelected(true);
            onSelect();
        }
    };

    const handleExamine = (e) => {
        e.stopPropagation();
        setIsModalOpen(true);
    };

    const handleAcceptDemands = () => {
        console.log('Talep kabul ediliyor...'); // Debug için
        onSelect({
            action: 'accept',
            effects: demandEffects.accept
        });
        setIsModalOpen(false);
        setIsSelected(true);
    };

    const handleRejectDemands = () => {
        console.log('Talep reddediliyor...'); // Debug için
        onSelect({
            action: 'reject',
            effects: demandEffects.reject
        });
        setIsModalOpen(false);
        setIsSelected(true);
    };

    // Kart yüzü render fonksiyonları aynı kalıyor...
    return (
        <>
            <div
                className={`card ${isFlipped ? 'flipped' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={handleClick}
            >
                <div className="card-face card-front" data-type={type}>
                    <div className="card-header" style={{background: getHeaderColor()}}>
                        <div className="card-number" style={{background: getHeaderColor()}}>
                            {number}
                        </div>
                    </div>
                    <div className="card-content">
                        <h2>{title}</h2>

                        {type === 'customer' && customerType && income && (
                            <div className="customer-details">
                                <p className="customer-type">Müşteri: {customerType}</p>
                                <p className="customer-income">Günlük Gelir: {income}₺</p>
                            </div>
                        )}

                        {/* Bu SVG bloğunu değiştireceğiz */}
                        <svg className="card-icon" viewBox="0 0 64 64">
                            {type === 'crisis' && (
                                <>
                                    {/* Lego Üzgün Robot/Tamir İkonu */}
                                    <rect x="16" y="12" width="32" height="32" fill="#e84d4d" rx="4"/>
                                    {/* Ana kafa */}
                                    <rect x="20" y="16" width="8" height="8" fill="#fff" rx="2"/>
                                    {/* Sol göz */}
                                    <rect x="36" y="16" width="8" height="8" fill="#fff" rx="2"/>
                                    {/* Sağ göz */}
                                    <path d="M24 32 L40 32 L40 38 L24 38 Z" fill="#333"/>
                                    {/* Üzgün ağız */}
                                    <rect x="12" y="44" width="40" height="8" fill="#666" rx="2"/>
                                    {/* Tamir aleti */}
                                    <rect x="28" y="42" width="8" height="12" fill="#888"/>
                                    {/* Tamir aleti sapı */}
                                </>
                            )}

                            {type === 'customer' && (
                                <>
                                    {/* Lego Müşteri Figürü */}
                                    <rect x="24" y="8" width="16" height="16" fill="#4A90E2" rx="8"/>
                                    {/* Kafa */}
                                    <rect x="20" y="24" width="24" height="28" fill="#4A90E2" rx="4"/>
                                    {/* Vücut */}
                                    <rect x="16" y="26" width="8" height="20" fill="#4A90E2" rx="4"/>
                                    {/* Sol kol */}
                                    <rect x="40" y="26" width="8" height="20" fill="#4A90E2" rx="4"/>
                                    {/* Sağ kol */}
                                    <rect x="28" y="12" width="3" height="3" fill="#fff"/>
                                    {/* Sol göz */}
                                    <rect x="33" y="12" width="3" height="3" fill="#fff"/>
                                    {/* Sağ göz */}
                                    <path d="M29 17 L35 17 L32 20 Z" fill="#fff"/>
                                    {/* Gülümseyen ağız */}
                                </>
                            )}

                            {type === 'resource' && (
                                <>
                                    {/* Lego Sandık/Hazine */}
                                    <rect x="12" y="24" width="40" height="28" fill="#2ecc71" rx="4"/>
                                    {/* Ana sandık */}
                                    <rect x="10" y="22" width="44" height="6" fill="#25a25a" rx="2"/>
                                    {/* Üst kenar */}
                                    <rect x="16" y="28" width="32" height="20" fill="#fff" rx="2"/>
                                    {/* İç detay */}
                                    <circle cx="32" cy="38" r="6" fill="#ffd700"/>
                                    {/* Hazine parıltısı */}
                                    <circle cx="32" cy="38" r="4" fill="#ffeb3b"/>
                                    {/* İç parıltı */}
                                    <rect x="28" y="28" width="8" height="4" fill="#25a25a" rx="1"/>
                                    {/* Kilit */}
                                </>
                            )}
                        </svg>
                    </div>
                </div>
                <div className="card-face card-back" data-type={type}>
                    <div className="card-content">
                        <h2>{title}</h2>
                        <p>{description}</p>
                        <div className="effects">
                            {type !== 'customer' && effects?.money !== 0 && (
                                <p className={effects.money > 0 ? 'positive' : 'negative'}>
                                    {effects.money > 0 ? '+' : ''}{effects.money}$
                                </p>
                            )}
                            {type !== 'customer' && effects?.satisfaction !== 0 && (
                                <p className={effects.satisfaction > 0 ? 'positive' : 'negative'}>
                                    {effects.satisfaction > 0 ? '+' : ''}{effects.satisfaction}% Memnuniyet
                                </p>
                            )}
                        </div>
                        {!isSelected && isActive && type === 'customer' && (
                            <button className="examine-btn" onClick={handleExamine}>
                                İncele
                            </button>
                        )}
                        {!isSelected && isActive && (type === 'crisis' || type === 'resource') && (
                            <button className="select-btn" onClick={handleSelect}>
                                Seç
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {type === 'customer' && (
                <DemandModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    demands={demands}
                    demandEffects={demandEffects}
                    onAccept={handleAcceptDemands}
                    onReject={handleRejectDemands}
                />
            )}
        </>
    );
};

GameCard.propTypes = {
    type: PropTypes.oneOf(['customer', 'crisis', 'resource']).isRequired,
    number: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    customerType: PropTypes.string,
    income: PropTypes.number,
    demands: PropTypes.string,
    demandEffects: PropTypes.shape({
        accept: PropTypes.shape({
            money: PropTypes.number,
            satisfaction: PropTypes.number
        }),
        reject: PropTypes.shape({
            money: PropTypes.number,
            satisfaction: PropTypes.number
        })
    }),
    effects: PropTypes.shape({
        money: PropTypes.number,
        satisfaction: PropTypes.number
    }),
    onSelect: PropTypes.func.isRequired,
    isActive: PropTypes.bool,
    turnNumber: PropTypes.number.isRequired
};

GameCard.defaultProps = {
    isActive: true,
    effects: {
        money: 0,
        satisfaction: 0
    },
    demandEffects: {
        accept: { money: 0, satisfaction: 0 },
        reject: { money: 0, satisfaction: 0 }
    }
};

export default GameCard;