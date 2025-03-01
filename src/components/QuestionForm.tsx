import React, { useState } from 'react';
import { db } from '../firebase/config';
import { collection, addDoc } from 'firebase/firestore';

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

interface QuestionData {
    text: string;
    department: string;
    difficulty: number;
    options: Option[];
}

const QuestionForm = () => {
    const [questionData, setQuestionData] = useState<QuestionData>({
        text: '',
        department: '',
        difficulty: 1,
        options: [
            {
                text: '',
                effects: {
                    revenue: 0,
                    customerSatisfaction: 0,
                    staffSatisfaction: 0,
                    occupancyRate: 0,
                    sustainability: 0,
                },
            },
        ],
    });

    // Departmanları, kullanıcıya gösterilecek label ve arka uçta kaydedilecek id olarak tanımlıyoruz
    const departments = [
        { id: 'reservation', label: 'Rezervasyon' },
        { id: 'customer_relations', label: 'Müşteri İlişkileri' },
        { id: 'hr', label: 'Personel Yönetimi' },
        { id: 'financial', label: 'Gelir Yönetimi' },
        { id: 'operations', label: 'Operasyon Yönetimi' },
        { id: 'sustainability', label: 'Sürdürülebilirlik' },
    ];

    const effectLabels = {
        revenue: 'Gelir',
        customerSatisfaction: 'Müşteri Memnuniyeti',
        staffSatisfaction: 'Personel Memnuniyeti',
        occupancyRate: 'Doluluk Oranı',
        sustainability: 'Sürdürülebilirlik',
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'questions'), questionData);
            alert('Soru başarıyla eklendi!');
            setQuestionData({
                text: '',
                department: '',
                difficulty: 1,
                options: [
                    {
                        text: '',
                        effects: {
                            revenue: 0,
                            customerSatisfaction: 0,
                            staffSatisfaction: 0,
                            occupancyRate: 0,
                            sustainability: 0,
                        },
                    },
                ],
            });
        } catch (error) {
            alert('Soru eklenirken bir hata oluştu!');
            console.error('Error:', error);
        }
    };

    const addOption = () => {
        if (questionData.options.length < 4) {
            setQuestionData({
                ...questionData,
                options: [
                    ...questionData.options,
                    {
                        text: '',
                        effects: {
                            revenue: 0,
                            customerSatisfaction: 0,
                            staffSatisfaction: 0,
                            occupancyRate: 0,
                            sustainability: 0,
                        },
                    },
                ],
            });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="question-form">
            <div className="form-group">
                <label>Soru Metni:</label>
                <textarea
                    value={questionData.text}
                    onChange={(e) =>
                        setQuestionData({ ...questionData, text: e.target.value })
                    }
                    required
                />
            </div>

            <div className="form-group">
                <label>Departman:</label>
                <select
                    value={questionData.department}
                    onChange={(e) =>
                        setQuestionData({ ...questionData, department: e.target.value })
                    }
                    required
                >
                    <option value="">Seçiniz</option>
                    {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                            {dept.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>Zorluk Seviyesi:</label>
                <select
                    value={questionData.difficulty}
                    onChange={(e) =>
                        setQuestionData({
                            ...questionData,
                            difficulty: Number(e.target.value),
                        })
                    }
                    required
                >
                    <option value={1}>Kolay</option>
                    <option value={2}>Orta</option>
                    <option value={3}>Zor</option>
                </select>
            </div>

            <div className="options-section">
                <h3>Seçenekler</h3>
                {questionData.options.map((option, index) => (
                    <div key={index} className="option-group">
                        <label>Seçenek {index + 1}:</label>
                        <input
                            type="text"
                            value={option.text}
                            onChange={(e) => {
                                const newOptions = [...questionData.options];
                                newOptions[index].text = e.target.value;
                                setQuestionData({ ...questionData, options: newOptions });
                            }}
                            required
                        />

                        <div className="effects-group">
                            <h4>Etki Değerleri:</h4>
                            {Object.entries(option.effects).map(([effect, value]) => (
                                <div key={effect} className="effect-input">
                                    <label>
                                        {effectLabels[effect as keyof typeof effectLabels]}:
                                    </label>
                                    <input
                                        type="range"
                                        min="-100"
                                        max="100"
                                        value={value}
                                        onChange={(e) => {
                                            const newOptions = [...questionData.options];
                                            newOptions[index].effects[
                                                effect as keyof typeof option.effects
                                                ] = Number(e.target.value);
                                            setQuestionData({ ...questionData, options: newOptions });
                                        }}
                                    />
                                    <span>{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {questionData.options.length < 4 && (
                    <button
                        type="button"
                        onClick={addOption}
                        className="add-option-button"
                    >
                        Seçenek Ekle
                    </button>
                )}
            </div>

            <button type="submit" className="submit-button">
                Soruyu Kaydet
            </button>
        </form>
    );
};

export default QuestionForm;
