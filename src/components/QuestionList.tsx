import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

interface Option {
    text: string;
    effects: {
        revenue: number;
        customerSatisfaction: number;
        staffSatisfaction: number;
        occupancyRate: number;
        sustainability: number;
    };
}

interface Question {
    id: string;
    text: string;
    department: string;
    difficulty: number;
    options: Option[];
}

const QuestionList = () => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);

    const effectLabels = {
        revenue: 'Gelir',
        customerSatisfaction: 'Müşteri Memnuniyeti',
        staffSatisfaction: 'Personel Memnuniyeti',
        occupancyRate: 'Doluluk Oranı',
        sustainability: 'Sürdürülebilirlik'
    };

    useEffect(() => {
        fetchQuestions().catch(error =>
            console.error("Sorular yüklenirken bir hata oluştu:", error)
        );
    }, []);

    const fetchQuestions = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'questions'));
            const questionList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Question[];
            setQuestions(questionList);
        } catch (error) {
            console.error('Sorular yüklenirken hata:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (questionId: string) => {
        if (window.confirm('Bu soruyu silmek istediğinizden emin misiniz?')) {
            try {
                await deleteDoc(doc(db, 'questions', questionId));
                setQuestions(questions.filter(q => q.id !== questionId));
                alert('Soru başarıyla silindi!');
            } catch (error) {
                console.error('Soru silinirken hata:', error);
                alert('Soru silinirken bir hata oluştu!');
            }
        }
    };

    if (loading) {
        return <div className="loading">Sorular yükleniyor...</div>;
    }

    return (
        <div className="questions-list">
            {questions.length === 0 ? (
                <p className="no-questions">Henüz soru eklenmemiş.</p>
            ) : (
                questions.map((question) => (
                    <div key={question.id} className="question-card">
                        <div className="question-header">
                            <span className={`difficulty difficulty-${question.difficulty}`}>
                                {question.difficulty === 1 ? 'Kolay' :
                                    question.difficulty === 2 ? 'Orta' : 'Zor'}
                            </span>
                            <span className="department">{question.department}</span>
                        </div>

                        <p className="question-text">{question.text}</p>

                        <div className="options-list">
                            <h4>Seçenekler:</h4>
                            {question.options.map((option, index) => (
                                <div key={index} className="option-item">
                                    <p>{`${index + 1}. ${option.text}`}</p>
                                    <div className="effects">
                                        {Object.entries(option.effects).map(([key, value]) => (
                                            <span key={key} className="effect-tag">
                                                {effectLabels[key as keyof typeof effectLabels]}: {value}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="question-actions">
                            <button
                                className="delete-button"
                                onClick={() => handleDelete(question.id)}
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

export default QuestionList;