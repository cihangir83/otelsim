// ../types/firebase.ts

import { Timestamp } from 'firebase/firestore';

export interface MetricValues {
    revenue: number;
    customerSatisfaction: number;
    staffSatisfaction: number;
    occupancyRate: number;
    sustainability: number;
}

export interface UserData {
    // Muhtemelen bunlardan birini silebilirsiniz, örneğin lastLoginTimestamp'ı
    lastLoginDate: Timestamp;
    email: string;
    name: string;
    currentRole: string;
    hotelType: string;
    currentDay: number;
    completedScenarios: number;
    metrics: MetricValues;
    achievements: string[];
    // lastLoginTimestamp: Timestamp; // Bunu silebilirsiniz
    createdAt: Timestamp;
}

export interface QuestionData {
    text: string;
    department: string;
    difficulty: number;
    options: Array<{
        text: string;
        effects: MetricValues;
    }>;
}

export interface UserDecision {
    id: string;
    userId: string;
    questionId: string;
    selectedOption: number; // Index
    metrics: {
        before: MetricValues;
        after: MetricValues;
    };
    createdAt: Timestamp;
    // Yeni alanlar
    day?: number;
    scenarioText?: string;
    selectedOptionText?: string;
    gameId?: string;
    // --- MCDA Scores (Kodun kullandığı isimlere eşleşmeli) ---
    baoScore?: number; // BAO skoru
    sawScore?: number; // SAW skoru
    topsisScore?: number; // TOPSIS skoru
    vikorSScore?: number; // VIKOR S skoru (Kod bunu kullanıyor)
    vikorRScore?: number; // VIKOR R skoru (Kod bunu kullanıyor)
    ahpScore?: number; // Yeni eklenenler
    electreScore?: number;
    mavtScore?: number;
}