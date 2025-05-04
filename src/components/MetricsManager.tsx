import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface MetricValues {
    revenue: number;
    customerSatisfaction: number;
    staffSatisfaction: number;
    occupancyRate: number;
    sustainability: number;
}

// Firestore'dan geleceğini düşündüğümüz nesnenin tip karşılığı.
// Artık gerçekten kullanacağız (docSnap.data() as HotelType).
interface HotelType {
    type: string;
    metrics: MetricValues;
}

const MetricsManager = () => {
    const [selectedType, setSelectedType] = useState('5_star');
    const [metrics, setMetrics] = useState<MetricValues>({
        revenue: 1000,
        customerSatisfaction: 70,
        staffSatisfaction: 80,
        occupancyRate: 60,
        sustainability: 75
    });

    const hotelTypes = [
        { id: '5_star', label: '5 Yıldızlı Otel' },
        { id: 'boutique', label: 'Butik Otel' },
        { id: 'resort', label: 'Tatil Köyü' }
    ];

    const metricLabels = {
        revenue: 'Gelir (x100₺)',
        customerSatisfaction: 'Müşteri Memnuniyeti (%)',
        staffSatisfaction: 'Personel Memnuniyeti (%)',
        occupancyRate: 'Doluluk Oranı (%)',
        sustainability: 'Sürdürülebilirlik (%)'
    };

    // useEffect içinde loadMetrics çağrılırken await veya .then/.catch kullanarak
    // "Promise returned from loadMetrics is ignored" uyarısını ortadan kaldırıyoruz.
    useEffect(() => {
        (async () => {
            try {
                await loadMetrics();
            } catch (error) {
                console.error('Metrikler yüklenirken hata:', error);
            }
        })();
    }, [selectedType]);

    const loadMetrics = async () => {
        const docRef = doc(db, 'hotelMetrics', selectedType);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // Firestore'dan dönen veriyi HotelType olarak alıp metrics state'ini güncelliyoruz.
            const data = docSnap.data() as HotelType;
            setMetrics(data.metrics);
        } else {
            // Eğer doküman yoksa (yeni kayıt oluşturulacaksa)
            // istersen burada varsayılan değerleri de set edebilirsin.
            // setMetrics({ ... });
        }
    };

    const handleSave = async () => {
        try {
            await setDoc(doc(db, 'hotelMetrics', selectedType), {
                type: selectedType,
                metrics: metrics
            });
            alert('Metrikler başarıyla kaydedildi!');
        } catch (error) {
            console.error('Metrikler kaydedilirken hata:', error);
            alert('Metrikler kaydedilirken bir hata oluştu!');
        }
    };

    return (
        <div className="metrics-manager">
            <div className="metrics-header">
                <h2>Otel Tipi Metrikleri</h2>
                <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="hotel-type-select"
                >
                    {hotelTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                            {type.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="metrics-grid">
                {Object.entries(metrics).map(([key, value]) => (
                    <div key={key} className="metric-item">
                        <label>{metricLabels[key as keyof typeof metricLabels]}</label>
                        <div className="metric-input-group">
                            <input
                                type="range"
                                min="0"
                                max={key === 'revenue' ? 10000 : 100}
                                value={value}
                                onChange={(e) =>
                                    setMetrics({
                                        ...metrics,
                                        [key]: Number(e.target.value)
                                    })
                                }
                            />
                            <input
                                type="number"
                                value={value}
                                onChange={(e) =>
                                    setMetrics({
                                        ...metrics,
                                        [key]: Number(e.target.value)
                                    })
                                }
                                min="0"
                                max={key === 'revenue' ? 10000 : 100}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={handleSave} className="save-metrics-button">
                Metrikleri Kaydet
            </button>
        </div>
    );
};

export default MetricsManager;
