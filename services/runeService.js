const fs = require('fs');
const path = require('path');
const supabase = require('../supabaseClient');
const axios = require('axios');
const logger = require('../logger');
const logEvent = require('./System/CJM');
const { PRICES } = require('../utils/constants');

// **Библиотека с рунами**
const runesFlatLibrary = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../runeLibr/allRunes.json'), 'utf8')
);
//* Количество рун для различных типов
const typeCounts = {
  classic: 3,
  cross: 6,
  pyramid: 7
};
//* Проверка на латиницу / китайские символы
const FORBIDDEN_CHARS_REGEX = /[A-Za-z\u4E00-\u9FFF]/;
const MAX_ATTEMPTS = 2;

function isValidNeuralText(text) {
  if (typeof text !== 'string') return false;

  // Нет латиницы / китайских символов
  if (FORBIDDEN_CHARS_REGEX.test(text)) return false;

  return true;
}

async function chargeRuneLayout(telegramId) {
  const amount = PRICES.RUNES_LAYOUT_CRYSTAL;

  const { data, error } = await supabase.rpc('deduct_crystals', {
    p_telegram: telegramId,
    p_amount: amount
  });

  if (error) {
    logger.error(`[runeService, chargeRuneLayout] Ошибка в RPC deduct_crystals для telegramId=${telegramId}: ${error.message}`);
    throw error;
  }

  if (!data) {
    return { ok: false, code: 'not_enough_crystals' };
  }

  return { ok: true, amount };
}

async function refundRuneLayout(telegramId, amount) {
  const { error } = await supabase.rpc('refund_crystals', {
    p_telegram: telegramId,
    p_amount: amount
  });

  if (error) {
    logger.error(`[runeService, refundRuneLayout] Ошибка в RPC refund_crystals для telegramId=${telegramId}: ${error.message}`);
    throw error;
  }
}

//*  Вызов нейросети
async function getNeuralInterpretation(runes, theme, type, premium) {
  try {
    for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await axios.post('http://localhost:8080/api/v1/divination/encode', {
        runes,
        theme,
        type,
        premium,
        model: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8'//'Qwen/Qwen2.5-7B-Instruct-Turbo'
      });
      let text = response?.data.interpretation;

      if (isValidNeuralText(text)) {
        return text
      }
    }
    let text = 'Не удалось получить интерпретацию.'
    return text;
  } catch (error) {
    logger.error(`[runeService, getNeuralInterpretation] Ошибка при вызове нейросети: ${error.message}`);
    return 'Не удалось получить интерпретацию.';
  }
}

//*Функция для редактировании описания (наводим красоту) 
async function cleanDescription(interpretation) {
  return interpretation
    .replace(/\*\*Интерпретация:\*\*\s*/g, '')     // Убираем "**Интерпретация:**"
    .replace(/\*\*Совет:\*\*/g, 'Совет:')          // Заменяем "**Совет:**" на просто "Совет:"
  //  .replace(/\*/g, '')                            // Убираем все одиночные "*"
    .replace(/\n+/g, ' ')                          // Все переводы строк в один пробел
    .replace(/\s+Совет:/g, ' Совет:')              // Перед "Совет:" ровно один пробел
    .trim();                                       // Убираем лишние пробелы с краёв
}

//* Функция для генерации раскладаа
//async function generateLayout (telegramId,theme,type,useScore, amount ) {
  async function generateLayout (telegramId,theme,type,useCrystals ) {
  //Если расклад Да/Нет => в БД не учитываем 
  if (theme === 'danet') {
    const response = Math.random() < 0.5? 'Да': 'Нет';
    return {
      key: response,
      runes: [],
      description: response,
      theme: theme,
      type: type
    };
  }
  let paidAmount = null;
  try {
    if (useCrystals) {
      const charge = await chargeRuneLayout(telegramId);
      if (!charge.ok) {
        return { error: charge.code };
      }
      paidAmount = charge.amount;
    }
  /* if(useScore === 'crystal' || useScore === 'monet'){  //! TUT!!
    //logger.debug(`[runeService, generateLayout] Списание алмазов за расклад для telegramId=${telegramId}`);
    const { data: success, error: rpcError } = await supabase.rpc('deduct_crystals', {
      p_telegram: telegramId,
      p_amount: amount,  // стоимость расклада
      p_useScore: useScore
    });
    if (rpcError) {
      logger.error(`[runeService, generateLayout] Ошибка в RPC deduct_crystals_monet для telegramId=${telegramId}: ${rpcError.message}`);
      throw rpcError;
    }
    if (success === 'not_enough_crystals' && success === 'not_enough_monet') {
      return { error: success };
      }
    } */

  const count = typeCounts[type];
  if (!count) {
    logger.error(`[runeService, generateLayout] Неверный тип расклада для для telegramId=${telegramId}`);
    throw new Error('Неверный тип расклада');
  }

  const selectedRunes = [];
  const allRunes = [...runesFlatLibrary];                    // копируем библиотеку с рунами
  const getBaseId = (id) => (id > 25 ? id - 25 : id);
  const usedBaseIds = new Set();

  const shuffled = allRunes.sort(() => Math.random() - 0.5); // Перемешать копию рун

  for (const rune of shuffled) {
    const baseId = getBaseId(rune.id);
    if (usedBaseIds.has(baseId)) continue;

    selectedRunes.push(rune);
    usedBaseIds.add(baseId);

    if (selectedRunes.length >= count) break;
  }

  let prem = false;
  const{data:user,error:userError} = await supabase
    .from('users')
    .select('id')
    .eq('telegram',telegramId)
    .single();
  if(userError) throw userError;

  const{data:premData,error:premError} = await supabase
    .from('subscribe')
    .select('sub_id')
    .eq('user_id',user.id)
    .maybeSingle();
  if(premError) {
    logger.error(`[runeService, generateLayout] Ошибка при обращении к subscribe для telegramId=${telegramId}: ${premError.message}`)
    throw premError
  }
  if(premData){
    prem = true;
  }

  const runeKey = selectedRunes.map(r => r.id).join(',');  // Ключ рун (ID через запятую, чтобы кэш не зависел от перевёрнутости)
  // Проверяем кэш
  const { data: cached, error: cacheError } = await supabase
    .from('interpretation_cache')
    .select('description')
    .eq('key', runeKey)
    .eq('theme', theme)
    .eq('prem', prem)
    .maybeSingle();
  if (cacheError) {
    logger.error(`[runeService, generateLayout] Ошибка при обращении к interpretation_cache для telegramId=${telegramId}: ${cacheError.message}`)
    throw cacheError;
  }

  let cleanedDescription;
  const runeNames = selectedRunes.map(r => r.name);
  
  if (cached?.description) {
    cleanedDescription = cached.description;
  } else {

  const interpretation = await getNeuralInterpretation(runeNames, theme, type, prem);
  
  if (interpretation === 'Не удалось получить интерпретацию.') {
    // Если ошибка — достаем ВСЕ расклады из базы с такими же параметрами
    const { data: fallback, error: fallbackError } = await supabase
      .from('interpretation_cache')
      .select('key, description')
      .eq('theme', theme)
      .eq('type', type)
      .eq('prem', prem);
  
    if (fallbackError) throw fallbackError;
  
    if (fallback && fallback.length > 0) {
      // Берем случайный расклад
      const randomIndex = Math.floor(Math.random() * fallback.length);
      const picked = fallback[randomIndex];
  
      cleanedDescription = picked.description;
  
      // Руну подменяем из сохранённого key (иначе расхождение будет)
      const runeIds = picked.key.split(',');
      const fallbackRunes = allRunes.filter(r => runeIds.includes(r.id.toString()));

      // 👇 Здесь собираем финальное описание
      const runeConnectionLine = `Связи рун в раскладе: ${fallbackRunes.map(r => r.name).join(', ')}.`;
      const invite = 'Приобретите премиум подписку для подробной трактовки расклада.';
      let fullDescription = `${runeConnectionLine}\n\n${cleanedDescription}`;
      if (!prem) {
        fullDescription += `\n${invite}`;
      }

      return {
        key: picked.key,
        runes: fallbackRunes.map(r => r.name),
        description: fullDescription,
        theme,
        type
      };
    } else {
      // если даже в кэше ничего не нашли — вернем "заглушку"
      return {
        key: runeKey,
        runes: runeNames,
        description: 'Интерпретация временно недоступна.',
        theme,
        type
      };
    }
  }
  


  cleanedDescription = await cleanDescription(interpretation);
  // Фоновое кэширование
  const{error} = await supabase
      .from('interpretation_cache')
      .insert([{
        key: runeKey,
        theme: theme,
        type: type,
        prem: prem,
        description: cleanedDescription
      }])
      if (error) {
        logger.error(`[runeService, generateLayout] Ошибка при вставке в interpretation_cache для telegramId=${telegramId}: ${error.message}`)
        throw error;
      }
  }
const runeConnectionLine = `Связи рун в раскладе: ${runeNames.join(', ')}.`;
const invite = 'Приобретите премиум подписку для подробной трактовки расклада.';
let fullDescription = `${runeConnectionLine}\n\n${cleanedDescription}`;
if (!prem){
  fullDescription += `\n${invite}`;
}

  await logEvent.logEvent(telegramId, 'runes', { pay: useCrystals ? 'crystal' : 'free' });

  return {
    key:runeKey,
    runes: runeNames,
    description: fullDescription,
    theme,
    type
  };
  } catch (error) {
    if (paidAmount != null) {
      try {
        await refundRuneLayout(telegramId, paidAmount);
      } catch (refundError) {
        logger.error(`[runeService, generateLayout] Не удалось вернуть кристаллы для telegramId=${telegramId}: ${refundError.message}`);
      }
    }
    throw error;
  }
}

//*Добавление записи в spread (история расклада) и +1 в count т. layout_limits
async function insertInSpreadAndLimit (telegramId,layout) {     // Сохраняем данные в таблицу spreads в Supabase
  if (layout.theme !='danet'){
    const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('telegram', telegramId)
    .single();
  if (userError) {
    logger.error(`[runeService, insertInSpreadAndLimit] Ошибка при обращении к users для telegramId=${telegramId}: ${userError.message}`);
    throw userError;
  }
  const { data, error } = await supabase 
    .from('spreads')
    .insert([
      {
        Userid: user.id,      
        Runes: layout.key,
        Description: layout.description,  
        Theme:layout.theme,
        Type: layout.type
      }
    ]);
  if (error) {
    logger.error(`[runeService, insertInSpreadAndLimit] Ошибка при вставке в spreads для telegramId=${telegramId}: ${error.message}`);
    throw error;
  }  

  const { error: limitError } = await supabase.rpc('consume_layout_limit', {
    p_telegram: telegramId,
    p_theme: layout.theme,
    p_type: layout.type
  });
  if (limitError) {
    logger.error(`[runeService, insertInSpreadAndLimit] Ошибка при вызове RPC consume_layout_limit для telegramId=${telegramId}: ${limitError.message}`);
    throw limitError;
  }
  }
}

module.exports = {
  generateLayout,
  insertInSpreadAndLimit,
};
