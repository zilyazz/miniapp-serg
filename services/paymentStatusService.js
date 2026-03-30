//TODO Статус платежа 

const supabase = require('../supabaseClient');
const logger = require('../logger');

async function checkStatusPayment(telegramId,payment_id) {
  const {data: stat, error: errorStat} = await supabase
    .from('payments')
    .select('status')
    .eq('telegram_id',telegramId)
    .eq('payment_id',payment_id)
    .single();
  if (errorStat) {
    logger.error(`[paymentStatusService, checkStatusPayment] Ошибка при обращении ${telegramId} к payments: ${errorStat.message}`);
    throw errorStat;
  }
  
  let status = stat.status;
  if (!status){
    status = false;
  }

  return status;
}

module.exports = {
  checkStatusPayment,
};