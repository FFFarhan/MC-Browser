import { BLOCK_ID } from '../world/defaultBlocks';
import { ITEM_ID } from '../world/ItemRegistry';

export interface RecipeIngredient {
  readonly itemId: number;
  readonly amount: number;
}

export interface CraftingRecipe {
  readonly id: string;
  readonly name: string;
  readonly ingredients: readonly RecipeIngredient[];
  readonly output: RecipeIngredient;
}

const recipe = (
  id: string,
  name: string,
  ingredients: readonly RecipeIngredient[],
  output: RecipeIngredient,
): CraftingRecipe => ({ id, name, ingredients, output });
const ingredient = (itemId: number, amount = 1): RecipeIngredient => ({ itemId, amount });
const log = BLOCK_ID['oak_log'] ?? 0;
const planks = BLOCK_ID['oak_planks'] ?? 0;
const stone = BLOCK_ID['stone'] ?? 0;
const cobblestone = BLOCK_ID['cobblestone'] ?? 0;
const furnace = BLOCK_ID['furnace'] ?? 0;
const station = BLOCK_ID['crafting_station'] ?? 0;
const leaves = BLOCK_ID['oak_leaves'] ?? 0;
const sticks = ITEM_ID['stick'] ?? 0;

export const CRAFTING_RECIPES: readonly CraftingRecipe[] = Object.freeze([
  recipe('oak-planks', 'Oak log → 4 planks', [ingredient(log)], ingredient(planks, 4)),
  recipe('sticks', '2 planks → 4 sticks', [ingredient(planks, 2)], ingredient(sticks, 4)),
  recipe(
    'crafting-station',
    '4 planks → crafting station',
    [ingredient(planks, 4)],
    ingredient(station),
  ),
  recipe(
    'wooden-pickaxe',
    'Wooden pickaxe',
    [ingredient(planks, 3), ingredient(sticks, 2)],
    ingredient(ITEM_ID['wooden_pickaxe'] ?? 0),
  ),
  recipe(
    'wooden-axe',
    'Wooden axe',
    [ingredient(planks, 3), ingredient(sticks, 2)],
    ingredient(ITEM_ID['wooden_axe'] ?? 0),
  ),
  recipe(
    'wooden-shovel',
    'Wooden shovel',
    [ingredient(planks), ingredient(sticks, 2)],
    ingredient(ITEM_ID['wooden_shovel'] ?? 0),
  ),
  recipe('cobblestone', 'Stone → cobblestone', [ingredient(stone)], ingredient(cobblestone)),
  recipe(
    'stone-pickaxe',
    'Stone pickaxe',
    [ingredient(cobblestone, 3), ingredient(sticks, 2)],
    ingredient(ITEM_ID['stone_pickaxe'] ?? 0),
  ),
  recipe(
    'stone-axe',
    'Stone axe',
    [ingredient(cobblestone, 3), ingredient(sticks, 2)],
    ingredient(ITEM_ID['stone_axe'] ?? 0),
  ),
  recipe(
    'stone-shovel',
    'Stone shovel',
    [ingredient(cobblestone), ingredient(sticks, 2)],
    ingredient(ITEM_ID['stone_shovel'] ?? 0),
  ),
  recipe('furnace', '8 cobblestone → furnace', [ingredient(cobblestone, 8)], ingredient(furnace)),
  recipe(
    'smelt-iron',
    'Iron ore + coal → iron ingot',
    [ingredient(BLOCK_ID['iron_ore'] ?? 0), ingredient(BLOCK_ID['coal_ore'] ?? 0)],
    ingredient(ITEM_ID['iron_ingot'] ?? 0),
  ),
  recipe(
    'iron-pickaxe',
    'Iron pickaxe',
    [ingredient(ITEM_ID['iron_ingot'] ?? 0, 3), ingredient(sticks, 2)],
    ingredient(ITEM_ID['iron_pickaxe'] ?? 0),
  ),
  recipe(
    'iron-axe',
    'Iron axe',
    [ingredient(ITEM_ID['iron_ingot'] ?? 0, 3), ingredient(sticks, 2)],
    ingredient(ITEM_ID['iron_axe'] ?? 0),
  ),
  recipe(
    'iron-shovel',
    'Iron shovel',
    [ingredient(ITEM_ID['iron_ingot'] ?? 0), ingredient(sticks, 2)],
    ingredient(ITEM_ID['iron_shovel'] ?? 0),
  ),
  recipe(
    'wooden-sword',
    'Wooden sword',
    [ingredient(planks, 2), ingredient(sticks)],
    ingredient(ITEM_ID['wooden_sword'] ?? 0),
  ),
  recipe(
    'stone-sword',
    'Stone sword',
    [ingredient(cobblestone, 2), ingredient(sticks)],
    ingredient(ITEM_ID['stone_sword'] ?? 0),
  ),
  recipe(
    'iron-sword',
    'Iron sword',
    [ingredient(ITEM_ID['iron_ingot'] ?? 0, 2), ingredient(sticks)],
    ingredient(ITEM_ID['iron_sword'] ?? 0),
  ),
  recipe(
    'wild-berries',
    'Oak leaves → wild berries',
    [ingredient(leaves, 2)],
    ingredient(ITEM_ID['berries'] ?? 0),
  ),
]);
