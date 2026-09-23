import { MutationBatch, type WorldMutationStore } from '../world/MutationBatch';
import { CRAFTING_RECIPES, type CraftingRecipe } from './recipes';

function getRecipe(id: string): CraftingRecipe | undefined {
  return CRAFTING_RECIPES.find((entry) => entry.id === id);
}

export function canCraftRecipe(store: WorldMutationStore, recipeId: string): boolean {
  const recipe = getRecipe(recipeId);
  return Boolean(
    recipe && recipe.ingredients.every((item) => store.getItemCount(item.itemId) >= item.amount),
  );
}

export function craftRecipe(store: WorldMutationStore, recipeId: string): boolean {
  const recipe = getRecipe(recipeId);
  if (!recipe || !canCraftRecipe(store, recipeId)) return false;
  const batch = new MutationBatch(store.revision);
  for (const ingredient of recipe.ingredients)
    batch.changeItem(ingredient.itemId, -ingredient.amount);
  batch.changeItem(recipe.output.itemId, recipe.output.amount);
  return store.commit(batch);
}
