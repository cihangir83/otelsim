// src/components/HotelList.tsx
import React, { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface MetricValues {
    revenue: number;
    customerSatisfaction: number;
    staffSatisfaction: number;
    occupancyRate: number;
    sustainability: number;
}

interface HotelData {
    id: string;   // Firestore doc ID
    type: string; // Örn: "5_star", "boutique", "resort"
    metrics: MetricValues;
}

const HotelList = () => {
    const [hotels, setHotels] = useState<HotelData[]>([]);

    // Bileşen yüklendiğinde Firestore’dan verileri çek
    useEffect(() => {
        fetchHotels();
    }, []);

    const fetchHotels = async () => {
        try {
            const colRef = collection(db, 'hotelMetrics');
            const snapshot = await getDocs(colRef);
            const hotelList = snapshot.docs.map((docSnap) => {
                return {
                    id: docSnap.id,
                    ...(docSnap.data() as Omit<HotelData, 'id'>)
                };
            });
            setHotels(hotelList);
        } catch (error) {
            console.error('Oteller yüklenirken hata oluştu:', error);
        }
    };

    const handleDelete = async (hotelId: string) => {
        try {
            await deleteDoc(doc(db, 'hotelMetrics', hotelId));
            // Silme başarılı ise local state'ten de çıkar
            setHotels((prev) => prev.filter((hotel) => hotel.id !== hotelId));
            alert('Otel başarıyla silindi!');
        } catch (error) {
            console.error('Otel silinirken hata oluştu:', error);
            alert('Otel silinirken bir hata oluştu!');
        }
    };

    return (
        <div className="hotel-list-container">
            {hotels.length === 0 ? (
                <p>Hiç otel kaydı bulunamadı.</p>
            ) : (
                <table>
                    <thead>
                    <tr>
                        <th>Otel Tipi</th>
                        <th>Gelir</th>
                        <th>Müşteri Memnuniyeti</th>
                        <th>Personel Memnuniyeti</th>
                        <th>Doluluk Oranı</th>
                        <th>Sürdürülebilirlik</th>
                        <th>İşlem</th>
                    </tr>
                    </thead>
                    <tbody>
                    {hotels.map((hotel) => (
                        <tr key={hotel.id}>
                            <td>{hotel.type}</td>
                            <td>{hotel.metrics.revenue}</td>
                            <td>{hotel.metrics.customerSatisfaction}</td>
                            <td>{hotel.metrics.staffSatisfaction}</td>
                            <td>{hotel.metrics.occupancyRate}</td>
                            <td>{hotel.metrics.sustainability}</td>
                            <td>
                                <button onClick={() => handleDelete(hotel.id)}>Sil</button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default HotelList;
