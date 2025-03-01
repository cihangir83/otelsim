import { db } from '../firebase/config';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    addDoc,
    Timestamp,
    query,
    where,
    getDocs
} from 'firebase/firestore';
import {
    UserData,
    MetricValues,
    UserDecision
} from '../types/firebase';

// Kullanıcı işlemleri
export const createNewUser = async (userId: string, userData: {
    email: string;
    name: string;
    currentRole: string;
    hotelType: string;
    currentDay: number;
    completedScenarios: number;
    metrics: MetricValues;
    achievements: any[]
}) => {
    try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, {
            ...userData,
            createdAt: Timestamp.now(),
            lastLoginDate: Timestamp.now()
        });
    } catch (error) {
        console.error('Kullanıcı oluşturma hatası:', error);
        throw error;
    }
};

export const getUserData = async (userId: string): Promise<UserData | null> => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            return userDoc.data() as UserData;
        }
        return null;
    } catch (error) {
        console.error('Kullanıcı verisi getirme hatası:', error);
        throw error;
    }
};

export const updateUserMetrics = async (
    userId: string,
    newMetrics: MetricValues
) => {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { metrics: newMetrics });
    } catch (error) {
        console.error('Metrik güncelleme hatası:', error);
        throw error;
    }
};

// Karar kaydetme işlemi
export const saveUserDecision = async (decision: Omit<UserDecision, 'createdAt' | 'id'>) => {
    try {
        await addDoc(collection(db, 'userDecisions'), {
            ...decision,
            createdAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Karar kaydetme hatası:', error);
        throw error;
    }
};

// ADDED: Kullanıcı kararlarını (userDecisions) Firestore'dan çekmek için fonksiyon
export const loadUserDecisions = async (userId: string): Promise<UserDecision[]> => {
    try {
        const decisionsRef = collection(db, 'userDecisions');
        const q = query(decisionsRef, where('userId', '==', userId));
        const querySnapshot = await getDocs(q);

        // Her dokümanı UserDecision tipinde bir objeye dönüştürüyoruz
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            userId: doc.data().userId,
            questionId: doc.data().questionId,
            selectedOption: doc.data().selectedOption,
            metrics: doc.data().metrics,
            createdAt: doc.data().createdAt
        })) as UserDecision[];
    } catch (error) {
        console.error('Karar geçmişi yükleme hatası:', error);
        throw error;
    }
};

// Başlangıç metriklerini oluştur
export const getInitialMetrics = (): MetricValues => ({
    revenue: 50,
    customerSatisfaction: 50,
    staffSatisfaction: 50,
    occupancyRate: 50,
    sustainability: 50
});
