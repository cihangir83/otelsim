import _ from 'lodash';

export async function loadGameData() {
  const customerData = JSON.parse(new TextDecoder().decode(
    await window.fs.readFile('Müşteri Kart.txt')
  )).musteriler;
  
  const opportunityData = JSON.parse(new TextDecoder().decode(
    await window.fs.readFile('Kriz ve Fırsat.txt')
  ));

  return {
    customers: _.sampleSize(customerData, 2),
    opportunity: _.sample([...opportunityData.firsatlar, ...opportunityData.opportunities])
  };
}

export function calculateEffects(type, data, action) {
  if (type === 'customer') {
    if (action === 'accept') {
      return {
        moneyChange: data.gunluk_gelir_tl * data.konaklama_suresi_gun,
        satisfactionChange: 0
      };
    } else {
      return {
        moneyChange: 0,
        satisfactionChange: data.memnuniyet_etkisi_karasilanmissa
      };
    }
  }

  if (type === 'opportunity') {
    const moneyChange = parseInt(action.gelir_artisi || action.income_increase || 0) -
                       parseInt(action.maliyet || action.cost || 0);
    const satisfactionChange = parseInt(action.memnuniyet_artisi || 
                                      action.satisfaction_increase || 0);
    return { moneyChange, satisfactionChange };
  }

  return { moneyChange: 0, satisfactionChange: 0 };
}