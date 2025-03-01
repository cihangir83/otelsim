import { Timestamp } from 'firebase/firestore';

export interface MetricValues {
    revenue: number;
    customerSatisfaction: number;
    staffSatisfaction: number;
    occupancyRate: number;
    sustainability: number;
}

export interface UserData {
    lastLoginDate: Timestamp;
    email: string;
    name: string;
    currentRole: string;
    hotelType: string;
    currentDay: number;
    completedScenarios: number;
    metrics: MetricValues;
    achievements: string[];
    lastLoginTimestamp: Timestamp;
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
    selectedOption: number;
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
}
