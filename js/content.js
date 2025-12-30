// content.js — static game content (crops, buildings, achievements, season rules)
(function(){
  const CROPS = [
    { id:"potato",  name:"Potato",  emoji:"🥔", basePrice:2, growMs:5200, yield:1,  seedCost:1, color:"#d3a55b" },
    { id:"carrot",  name:"Carrot",  emoji:"🥕", basePrice:3, growMs:6400, yield:1,  seedCost:1, color:"#ff8c2a" },
    { id:"corn",    name:"Corn",    emoji:"🌽", basePrice:4, growMs:8200, yield:1,  seedCost:1, color:"#ffd24a" },
    { id:"pumpkin", name:"Pumpkin", emoji:"🎃", basePrice:6, growMs:11000,yield:1,  seedCost:1, color:"#ff7a2a" }
  ];

  const SEASONS = [
    { id:"spring", label:"Spring", weatherWeights:{ sunny:0.35, rain:0.35, wind:0.2, storm:0.07, snow:0.03 }, marketMult:0.95, growMult:0.95 },
    { id:"summer", label:"Summer", weatherWeights:{ sunny:0.50, rain:0.15, wind:0.25, storm:0.07, snow:0.03 }, marketMult:0.92, growMult:0.90 },
    { id:"autumn", label:"Autumn", weatherWeights:{ sunny:0.30, rain:0.25, wind:0.25, storm:0.15, snow:0.05 }, marketMult:1.00, growMult:1.00 },
    { id:"winter", label:"Winter", weatherWeights:{ sunny:0.20, rain:0.10, wind:0.20, storm:0.20, snow:0.30 }, marketMult:1.10, growMult:1.10 }
  ];

  const BUILDINGS = [
    { key:"barn", name:"Barn", desc:"Slightly increases harvest yield as it levels.", baseCost:30, max:12, icon:"BARN" },
    { key:"silo", name:"Silo", desc:"Improves market prices slightly as it levels.", baseCost:26, max:12, icon:"SILO" },
    { key:"windmill", name:"Windmill", desc:"Speeds up crop growth slightly as it levels.", baseCost:34, max:12, icon:"MILL" },
    { key:"farmhouse", name:"Farmhouse", desc:"More animals appear (visual) and minor quest reward boost.", baseCost:22, max:12, icon:"HOUSE" }
  ];

  const ACHIEVEMENTS = [
    { id:"first_plant",   name:"First Plant",    desc:"Plant your first crop.",      reward:{ coins:5, seeds:2 } },
    { id:"first_harvest", name:"First Harvest",  desc:"Harvest your first plot.",    reward:{ coins:7, seeds:0 } },
    { id:"first_sell",    name:"First Sale",     desc:"Sell any crops once.",        reward:{ coins:10,seeds:0 } },
    { id:"hundred_coins", name:"Pocket Money",   desc:"Reach 100 coins.",            reward:{ coins:20,seeds:5 } },
    { id:"thousand_coins",name:"Big Stacks",     desc:"Reach 1000 coins.",           reward:{ coins:80,seeds:10 } },
    { id:"100_crops",     name:"Collector",      desc:"Collect 100 total crops.",   reward:{ coins:30,seeds:6 } },
    { id:"50_plants_day", name:"Planter",        desc:"Plant 50 plots in one day.", reward:{ coins:35,seeds:0 } },
    { id:"all_crops",     name:"Diversity",      desc:"Harvest every crop type.",   reward:{ coins:40,seeds:8 } },
  ];

  window.Content = { CROPS, SEASONS, BUILDINGS, ACHIEVEMENTS };
})();
