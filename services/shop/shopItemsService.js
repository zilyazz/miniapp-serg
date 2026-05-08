//TODO Открываем магазин
const supabase = require('../../supabaseClient');
const rarityOrder = {standart:0, rare:1, epic:2, legendary:3};
const statusOrder = { owned: 0, available: 1, locked: 2 }; 
const logger = require('../../logger');

async function shopOpen(telegramId,type) {
  //logger.debug(`[shopItemsService, shopOpen] Найдем user_id для telegramId=${telegramId}`);

  const{data:user,error:userError} = await supabase
    .from('users')
    .select('id')
    .eq('telegram',telegramId)
    .single();
  if(userError) {
    logger.error(`[shopItemsService, shopOpen] Ошибка при орбащении к users для telegramId=${telegramId}: ${userError.message}`);
    throw userError;
  }
  //logger.debug(`[shopItemsService, shopOpen] Параметры для всех товаров для telegramId=${telegramId}`);
  const{data: shopItems, error: shopError} = await supabase
    .from('shop_items')
    .select('id,type,name,description,price_crystal,is_active,obtainable,rarity')
    .eq('type',type);
  if(shopError) {
    logger.error(`[shopItemsService, shopOpen] Ошибка при орбащении к shop_items для telegramId=${telegramId}: ${shopError.message}`);
    throw shopError;
  }
  //logger.debug(`[shopItemsService, shopOpen] Найдем купленные товары для telegramId=${telegramId}`);
  const{data: inventory, error: inventoryError} = await supabase
    .from('user_inventory')
    .select('item_id,shop_items(type)')
    .eq('user_id',user.id);
  if(inventoryError) {
    logger.error(`[shopItemsService, shopOpen] Ошибка при орбащении к user_inventory для telegramId=${telegramId}: ${inventoryError.message}`);
    throw inventoryError;
  }
  //logger.debug(`[shopItemsService, shopOpen] Найдем все надетые товары для telegramId=${telegramId}`);
  const{data: equip, error: equipError} = await supabase
    .from('user_equipment')
    .select('item_id')
    .eq('user_id',user.id);
  if(equipError) {
    logger.error(`[shopItemsService, shopOpen] Ошибка при орбащении к user_equipment для telegramId=${telegramId}: ${equipError.message}`);
    throw equipError;
  }
  //logger.debug(`[shopItemsService, shopOpen] Отфильтруем товары для telegramId=${telegramId}`);
  const ownedSet = new Set(inventory.filter(i => i.shop_items?.type === type).map(i => i.item_id));
  const equippedSet = new Set(equip.map(e => e.item_id));
  const result = shopItems.map(item =>{
    const isEquipped = equippedSet.has(item.id);
    let status;
    if (ownedSet.has(item.id)){
      status = 'owned';
    } else if (item.is_active && item.obtainable ==='shop'){
      status = 'available';
    } else {
      status = 'locked';
    }

    return{
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      price_crystal: item.price_crystal,
      rarity:item.rarity,
      status,
      equipped: isEquipped
    };
  });
  // Сортировка по статусу, потом по редкости
  //logger.debug(`[shopItemsService, shopOpen] Фильтруем по редкости все товары для telegramId=${telegramId}`);
  result.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return rarityOrder[a.rarity] - rarityOrder[b.rarity];
  });

  return result;
}
//  const sortShop = shop.sort((a,b)=>a.type - b.type);

//  return sortShop;

module.exports = {
  shopOpen,
}
