import { useState, useEffect } from 'react'
import GameCard from './components/GameCard'
import IntroPage from './components/IntroPage'
import GameLog from './components/GameLog'
import { Smile, DollarSign, Hotel } from 'lucide-react'
import { customerCards, crisisCards, resourceCards } from './utils/cardData'
import './styles/App.css'
import DayAnnouncement from './components/DayAnnouncement.jsx';

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [satisfaction, setSatisfaction] = useState(75);
  const [money, setMoney] = useState(10000);
  const [currentCards, setCurrentCards] = useState([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [turnNumber, setTurnNumber] = useState(0);
  const [showDayAnnouncement, setShowDayAnnouncement] = useState(false);
  const [gameLogs, setGameLogs] = useState([]);

  const drawRandomCard = (cardArray) => {
    const randomIndex = Math.floor(Math.random() * cardArray.length);
    return { ...cardArray[randomIndex], isActive: true };
  };

  const startNewTurn = () => {
    if (turnNumber === 0) {
      setTurnNumber(1);
    } else {
      setTurnNumber(prev => prev + 1);
    }
    setShowDayAnnouncement(true);
    setTimeout(() => setShowDayAnnouncement(false), 2500)
    const newCards = [
      { ...drawRandomCard(customerCards), position: 'customer1' },
      { ...drawRandomCard(customerCards), position: 'customer2' },
      { ...drawRandomCard(crisisCards), position: 'crisis' },
      { ...drawRandomCard(resourceCards), position: 'resource' }
    ];
    setCurrentCards(newCards);
    setSelectedCount(0);
  };

  const logDecision = (card, response) => {
    let decision = '';
    let moneyChange = 0;

    if (card.type === 'customer') {
      decision = `${card.title} - ${response.action === 'accept' ? 'Kabul edildi' : 'Reddedildi'}`;
      moneyChange = response.action === 'accept' ? card.demandEffects.accept.money : 0;
    } else if (card.type === 'crisis') {
      decision = `${card.title} ile karşılaşıldı`;
      moneyChange = card.effects.money;
    } else {
      decision = `${card.title} kaynağı kullanıldı`;
      moneyChange = card.effects.money;
    }

    const newLog = {
      day: turnNumber,
      decisions: [decision],
      moneySpent: moneyChange < 0 ? Math.abs(moneyChange) : 0,
      moneyGained: moneyChange > 0 ? moneyChange : 0
    };

    setGameLogs(prev => [...prev, newLog]);
  };

  const handleCardSelect = (selectedCard, response) => {
    if (!selectedCard || !selectedCard.isActive) return;

    if (selectedCard.type === 'customer' && response) {
      const effects = response.action === 'accept' ?
          selectedCard.demandEffects.accept :
          selectedCard.demandEffects.reject;

      setMoney(prev => Math.max(0, prev + effects.money));
      setSatisfaction(prev => {
        const newValue = prev + effects.satisfaction;
        return Math.min(100, Math.max(0, newValue));
      });
    } else {
      const { money: moneyEffect = 0, satisfaction: satisfactionEffect = 0 } = selectedCard.effects;
      setMoney(prev => Math.max(0, prev + moneyEffect));
      setSatisfaction(prev => {
        const newValue = prev + satisfactionEffect;
        return Math.min(100, Math.max(0, newValue));
      });
    }

    logDecision(selectedCard, response);

    setCurrentCards(prev =>
        prev.map(card =>
            card.position === selectedCard.position
                ? { ...card, isActive: false }
                : card
        )
    );

    setSelectedCount(prev => prev + 1);
  };

  useEffect(() => {
    if (gameStarted) {
      startNewTurn();
    }
  }, [gameStarted]);

  if (!gameStarted) {
    return <IntroPage onStartGame={() => setGameStarted(true)} />;
  }

  return (
      <div className="main-container">
        <DayAnnouncement
            day={turnNumber}
            isVisible={showDayAnnouncement}
        />
        <div className="dashboard-header">
          <div className="hotel-info">
            <Hotel size={32} className="icon hotel-icon"/>
            <h1>Otel Simülasyonu</h1>
            <button
                onClick={startNewTurn}
                className="new-turn-btn"
                disabled={selectedCount < 4}
            >
              Yeni Gün Başlat
            </button>
          </div>

          <div className="stats-container">
            <div className="stat-item">
              <div className="stat-header">
                <Smile size={24} className="icon"/>
                <span>Müşteri Memnuniyeti</span>
              </div>
              <div className="progress-bar-container">
                <div
                    className="progress-bar"
                    style={{
                      width: `${satisfaction}%`,
                      backgroundColor: satisfaction > 70 ? '#22c55e' : satisfaction > 40 ? '#eab308' : '#ef4444'
                    }}
                >
                  <span>{satisfaction}%</span>
                </div>
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-header">
                <DollarSign size={24} className="icon"/>
                <span>Bütçe</span>
              </div>
              <div className="money-display">
                ${money.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="cards-container">
          {currentCards.map((card, index) => (
              <GameCard
                  key={`${card.position}-${turnNumber}-${index}`}
                  {...card}
                  onSelect={(response) => handleCardSelect(card, response)}
                  turnNumber={turnNumber}
              />
          ))}
        </div>

        <GameLog logs={gameLogs} />
      </div>
  );
}

export default App;