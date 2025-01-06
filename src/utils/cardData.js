export const customerCards = [
    // cardData.js içinde:
    {
        id: 'c1',
        type: 'customer',
        number: 'M1',
        title: 'Yeni Müşteri',
        customerType: 'Aile',
        income: 5000,
        demands: 'Temiz oda, çocuk oyun alanı, günlük temizlik hizmeti',
        demandEffects: {
            accept: {
                money: -1000,    // Talepleri karşılama maliyeti
                satisfaction: 0   // Karşılanınca memnuniyet değişmez
            },
            reject: {
                money: 0,        // Reddetmenin maliyeti yok
                satisfaction: -20 // Ama memnuniyet düşer
            }
        }
    },
    {
        id: 'c2',
        type: 'customer',
        number: 'M2',
        title: 'VIP Müşteri',
        customerType: 'İş İnsanı',
        income: 8000,
        demands: 'Süit oda, toplantı salonu, özel şoför hizmeti',
        demandEffects: {
            accept: {
                money: -1000,    // Talepleri karşılama maliyeti
                satisfaction: 0   // Karşılanınca memnuniyet değişmez
            },
            reject: {
                money: 0,        // Reddetmenin maliyeti yok
                satisfaction: -20 // Ama memnuniyet düşer
            }
        }
    }
];

export const crisisCards = [
    {
        id: 'k1',
        type: 'crisis',
        number: 'K1',
        title: 'Su Borusu Patladı!',
        description: 'Ana su borusunda ciddi hasar var.',
        effects: {
            money: -500,
            satisfaction: -10
        }
    },
    {
        id: 'k2',
        type: 'crisis',
        number: 'K2',
        title: 'Elektrik Kesintisi',
        description: 'Jeneratör arızası nedeniyle elektrikler kesildi.',
        effects: {
            money: -300,
            satisfaction: -15
        }
    }
];

export const resourceCards = [
    {
        id: 'r1',
        type: 'resource',
        number: 'R1',
        title: 'Yeni Personel',
        description: 'Deneyimli personel alımı yapıldı.',
        effects: {
            money: -400,
            satisfaction: 15
        }
    },
    {
        id: 'r2',
        type: 'resource',
        number: 'R2',
        title: 'Yenileme Çalışması',
        description: 'Odalar yenilendi.',
        effects: {
            money: -800,
            satisfaction: 25
        }
    }
];