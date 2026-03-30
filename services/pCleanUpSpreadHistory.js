//TODO Функция очистки истории раскладов
//Оставляет только 5 последних уникальных раскладов у каждого пользователя
require('dotenv').config();
const supabase = require('../supabaseClient');
const logger = require('../logger');

async function cleanUpSpreadHistory() {
    try {
        logger.info(`[pCleanUpSpreadHistory, cleanUpSpreadHistory] Чистим истоирю раскладов`);
    // Получаем все расклады, отсортированные по дате (от новых к старым)
    const { data: spreads, error: dateError } = await supabase
        .from('spreads')
        .select('id, Userid, DateCreate')
        .order('DateCreate', { ascending: false });

        if (dateError) {
            logger.error(`[pCleanUpSpreadHistory, cleanUpSpreadHistory] Ошибка при обращении к spreads: ${dateError.message}`);
            return;
        }

        if (!spreads || spreads.length === 0) {
            logger.info(`[pCleanUpSpreadHistory, cleanUpSpreadHistory] ⚠️ Нет данных для обработки, выходим`);
            return;
        }

        // Группируем расклады по пользователям
        const userSpreads = {};

        spreads.forEach(({ id, Userid, DateCreate }) => {
            if (!userSpreads[Userid]) {
                userSpreads[Userid] = [];
            }
            userSpreads[Userid].push({ id, date: new Date(DateCreate).toISOString().split('T')[0] });
        });

        // Определяем, какие записи оставить (20 последних у каждого пользователя)
        const allowedIds = new Set();
        Object.keys(userSpreads).forEach(userId => {
            const uniqueDates = new Set();

            for (const spread of userSpreads[userId]) {
                if (!uniqueDates.has(spread.date)) {
                    uniqueDates.add(spread.date);
                    allowedIds.add(spread.id);
                }
                if (uniqueDates.size >= 20) break;
            }
        });

        //console.log("✅ Оставляем записи с ID:", [...allowedIds]);

        // Удаляем записи, которых нет в allowedIds
        const { error: deleteError } = await supabase
        .from('spreads')
        .delete()
        .not('id', 'in', `(${[...allowedIds].join(',')})`);    

        if (deleteError) {
            logger.error(`[pCleanUpSpreadHistory, cleanUpSpreadHistory] Ошибка при удалении старых записей из spreads: ${deleteError.message}`);
        } 
    } catch (error) {
        logger.error(`[pCleanUpSpreadHistory, cleanUpSpreadHistory] Ошибка: ${error.message}`);
    }
}

//cleanUpSpreadHistory();
module.exports = cleanUpSpreadHistory;
