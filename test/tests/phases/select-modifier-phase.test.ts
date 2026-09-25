import type { BattleScene } from "#app/battle-scene";
import { settings } from "#app/global-settings-manager";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { modifierTypes } from "#data/data-lists";
import { AbilityId } from "#enums/ability-id";
import { Button } from "#enums/buttons";
import { ModifierTier } from "#enums/modifier-tier";
import { MoveId } from "#enums/move-id";
import { ShopCursorTarget } from "#enums/shop-cursor-target";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { PlayerPokemon } from "#field/pokemon";
import type { CustomModifierSettings } from "#modifiers/modifier-type";
import { ModifierTypeOption, upgradeModifierTypeOption } from "#modifiers/modifier-type";
import {
  evaluateOrderOfOperations,
  generateAdditionSubtractionProblem,
  generateDivisionProblem,
  generateOneVariableEquationProblem,
  generateOrderOfOperationsProblem,
  generateUnitConversionProblem,
  getMathChallengeMaxFactor,
  SelectModifierPhase,
} from "#phases/select-modifier-phase";
import { GameManager } from "#test/framework/game-manager";
import { initSceneWithoutEncounterPhase } from "#test/utils/game-manager-utils";
import { ModifierSelectUiHandler } from "#ui/modifier-select-ui-handler";
import { shiftCharCodes } from "#utils/common";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("SelectModifierPhase", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let scene: BattleScene;

  beforeAll(() => {
    phaserGame = new Phaser.Game({
      type: Phaser.HEADLESS,
    });
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);
    scene = game.scene;

    game.override
      .moveset([MoveId.FISSURE, MoveId.SPLASH])
      .ability(AbilityId.NO_GUARD)
      .startingLevel(200)
      .enemySpecies(SpeciesId.MAGIKARP)
      .battleStyle("single");
  });

  it("should start a select modifier phase", async () => {
    initSceneWithoutEncounterPhase(scene, [SpeciesId.ABRA, SpeciesId.VOLCARONA]);
    const selectModifierPhase = new SelectModifierPhase();
    scene.phaseManager.unshiftPhase(selectModifierPhase);
    await game.phaseInterceptor.to("SelectModifierPhase");

    scene.ui.processInput(Button.SUBMIT);
    await vi.waitFor(() => expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT));
    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
  });

  it("should generate random modifiers", async () => {
    await game.classicMode.startBattle(SpeciesId.ABRA, SpeciesId.VOLCARONA);
    game.move.select(MoveId.FISSURE);
    await game.phaseInterceptor.to("SelectModifierPhase");

    scene.ui.processInput(Button.SUBMIT);
    await vi.waitFor(() => expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT));
    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    const modifierSelectHandler = scene.ui.handlers.find(
      h => h instanceof ModifierSelectUiHandler,
    ) as ModifierSelectUiHandler;
    expect(modifierSelectHandler.options.length).toEqual(3);
  });

  it("should modify reroll cost", async () => {
    initSceneWithoutEncounterPhase(scene, [SpeciesId.ABRA, SpeciesId.VOLCARONA]);
    const options = [
      new ModifierTypeOption(modifierTypes.POTION(), 0, 100),
      new ModifierTypeOption(modifierTypes.ETHER(), 0, 400),
      new ModifierTypeOption(modifierTypes.REVIVE(), 0, 1000),
    ];

    const selectModifierPhase1 = new SelectModifierPhase(0, undefined, {
      guaranteedModifierTypeOptions: options,
    });
    const selectModifierPhase2 = new SelectModifierPhase(0, undefined, {
      guaranteedModifierTypeOptions: options,
      rerollMultiplier: 2,
    });

    const cost1 = selectModifierPhase1.getRerollCost(false);
    const cost2 = selectModifierPhase2.getRerollCost(false);
    expect(cost2).toEqual(cost1 * 2);
  });

  it("should progressively increase the math challenge factor maximum", () => {
    expect(getMathChallengeMaxFactor(1)).toBe(12);
    expect(getMathChallengeMaxFactor(150)).toBe(100);
    expect(getMathChallengeMaxFactor(151)).toBe(100);
    expect(getMathChallengeMaxFactor(75)).toBeGreaterThan(12);
    expect(getMathChallengeMaxFactor(75)).toBeLessThan(100);
  });

  it("should evaluate order of operations using PEMDAS", () => {
    expect(evaluateOrderOfOperations("2+3x4")).toBe(14);
    expect(evaluateOrderOfOperations("(2+3)x4")).toBe(20);
    expect(evaluateOrderOfOperations("18÷3+2x4")).toBe(14);
    expect(evaluateOrderOfOperations("20÷(2+3)")).toBe(4);
    expect(() => evaluateOrderOfOperations("5÷2")).toThrow();
    expect(() => evaluateOrderOfOperations("5÷0")).toThrow();
  });

  it("should generate valid order of operations problems", () => {
    const problem = generateOrderOfOperationsProblem();
    const numbers = problem.expression.match(/\d+/g) ?? [];

    expect(numbers.length).toBeGreaterThanOrEqual(3);
    expect(numbers.length).toBeLessThanOrEqual(6);
    expect(numbers.every(number => Number(number) >= 1 && Number(number) <= 12)).toBe(true);
    expect(problem.answerValue).toBe(evaluateOrderOfOperations(problem.expression));
  });

  it("should generate valid addition and subtraction problems", () => {
    const problem = generateAdditionSubtractionProblem();
    const match = problem.expression.match(/^(\d{3,4}) ([+-]) (\d{3,4})$/);

    expect(match).not.toBeNull();
    const left = Number(match![1]);
    const right = Number(match![3]);
    expect(problem.answerValue).toBe(match![2] === "+" ? left + right : left - right);
  });

  it("should generate whole-number division problems within wave ranges", () => {
    for (const waveIndex of [1, 50, 51, 100, 101, 200]) {
      for (let i = 0; i < 10; i++) {
        const problem = generateDivisionProblem(waveIndex);
        const match = problem.expression.match(/^(\d+) ÷ (\d+)$/);

        expect(match).not.toBeNull();
        const dividend = Number(match![1]);
        const divisor = Number(match![2]);
        const dividendMax = waveIndex <= 50 ? 100 : waveIndex <= 100 ? 500 : 1000;
        const divisorMax = waveIndex <= 50 ? 12 : waveIndex <= 100 ? 25 : 50;
        expect(dividend).toBeGreaterThanOrEqual(10);
        expect(dividend).toBeLessThanOrEqual(dividendMax);
        expect(divisor).toBeGreaterThanOrEqual(2);
        expect(divisor).toBeLessThanOrEqual(divisorMax);
        expect(problem.answerValue).toBeGreaterThan(1);
        expect(problem.answerValue).toBe(dividend / divisor);
      }
    }
  });

  it("should generate valid unit conversion problems", () => {
    for (let i = 0; i < 20; i++) {
      const problem = generateUnitConversionProblem();
      expect(problem.expression).toMatch(
        /^.+ converted to (inches|feet|centimeters|meters|kilometers|grams|kilograms)$/,
      );
      expect(problem.answerValue).toBe(Number(problem.answerValue.toFixed(3)));
      if (problem.expression.includes("feet") || problem.expression.includes("inches")) {
        expect(problem.expression).not.toMatch(/\.\d/);
      }
    }
  });

  it("should generate valid one-variable equation problems", () => {
    const problem = generateOneVariableEquationProblem();
    const match = problem.expression.match(/^Solve for .+: .+ = .+$/);

    expect(match).not.toBeNull();
    expect(problem.answerValue).toBeGreaterThanOrEqual(1);
    expect(problem.expression).toContain("Solve for");
  });

  it("should upgrade a free modifier option without mutating the original type", () => {
    const option = new ModifierTypeOption(modifierTypes.POTION(), 0);
    option.type.setTier(ModifierTier.COMMON);
    const originalType = option.type;
    const originalTier = originalType.tier;
    const upgradedOption = upgradeModifierTypeOption(option);

    expect(upgradedOption).not.toBe(option);
    expect(upgradedOption.type).not.toBe(originalType);
    expect(upgradedOption.type.id).toBe(originalType.id);
    expect(upgradedOption.cost).toBe(0);
    expect(upgradedOption.upgradeCount).toBe(1);
    expect(upgradedOption.type.tier).toBe((originalTier ?? 0) + 1);
    expect(originalType.tier).toBe(originalTier);
  });

  it.todo("should generate random modifiers from reroll", async () => {
    await game.classicMode.startBattle(SpeciesId.ABRA, SpeciesId.VOLCARONA);

    scene.money = 1000000;
    settings.update("display", "shopCursorTarget", ShopCursorTarget.REROLL);

    game.move.select(MoveId.FISSURE);
    await game.phaseInterceptor.to("SelectModifierPhase");

    // TODO: nagivate the ui to reroll somehow
    //const smphase = scene.phaseManager.getCurrentPhase() as SelectModifierPhase;
    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    const modifierSelectHandler = scene.ui.handlers.find(
      h => h instanceof ModifierSelectUiHandler,
    ) as ModifierSelectUiHandler;
    expect(modifierSelectHandler.options.length).toEqual(3);

    modifierSelectHandler.processInput(Button.ACTION);

    expect(scene.money).toBe(1000000 - 250);
    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    expect(modifierSelectHandler.options.length).toEqual(3);
  });

  it.todo("should generate random modifiers of same tier for reroll with reroll lock", async () => {
    game.override.startingModifier([{ name: "LOCK_CAPSULE" }]);
    await game.classicMode.startBattle(SpeciesId.ABRA, SpeciesId.VOLCARONA);
    scene.money = 1000000;
    // Just use fully random seed for this test
    vi.spyOn(scene, "resetSeed").mockImplementation(() => {
      scene.waveSeed = shiftCharCodes(scene.seed, 5);
      Phaser.Math.RND.sow([scene.waveSeed]);
      console.log("Wave Seed:", scene.waveSeed, 5);
    });

    game.move.select(MoveId.FISSURE);
    await game.phaseInterceptor.to("SelectModifierPhase");

    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    const modifierSelectHandler = scene.ui.handlers.find(
      h => h instanceof ModifierSelectUiHandler,
    ) as ModifierSelectUiHandler;
    expect(modifierSelectHandler.options.length).toEqual(3);
    const firstRollTiers: ModifierTier[] = modifierSelectHandler.options.map(o => o.modifierTypeOption.type.tier);

    // TODO: nagivate ui to reroll with lock capsule enabled

    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    expect(modifierSelectHandler.options.length).toEqual(3);
    // Reroll with lock can still upgrade
    expect(
      modifierSelectHandler.options[0].modifierTypeOption.type.tier
        - modifierSelectHandler.options[0].modifierTypeOption.upgradeCount,
    ).toEqual(firstRollTiers[0]);
    expect(
      modifierSelectHandler.options[1].modifierTypeOption.type.tier
        - modifierSelectHandler.options[1].modifierTypeOption.upgradeCount,
    ).toEqual(firstRollTiers[1]);
    expect(
      modifierSelectHandler.options[2].modifierTypeOption.type.tier
        - modifierSelectHandler.options[2].modifierTypeOption.upgradeCount,
    ).toEqual(firstRollTiers[2]);
  });

  it("should generate custom modifiers", async () => {
    await game.classicMode.startBattle(SpeciesId.ABRA, SpeciesId.VOLCARONA);
    scene.money = 1000000;
    const customModifiers: CustomModifierSettings = {
      guaranteedModifierTypeFuncs: [
        modifierTypes.MEMORY_MUSHROOM,
        modifierTypes.TM_ULTRA,
        modifierTypes.LEFTOVERS,
        modifierTypes.AMULET_COIN,
        modifierTypes.GOLDEN_PUNCH,
      ],
    };
    const selectModifierPhase = new SelectModifierPhase(0, undefined, customModifiers);
    scene.phaseManager.unshiftPhase(selectModifierPhase);
    game.move.select(MoveId.SPLASH);
    await game.phaseInterceptor.to("SelectModifierPhase");

    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    const modifierSelectHandler = scene.ui.handlers.find(
      h => h instanceof ModifierSelectUiHandler,
    ) as ModifierSelectUiHandler;
    expect(modifierSelectHandler.options.length).toEqual(5);
    expect(modifierSelectHandler.options[0].modifierTypeOption.type.id).toEqual("MEMORY_MUSHROOM");
    expect(modifierSelectHandler.options[1].modifierTypeOption.type.id).toEqual("TM_ULTRA");
    expect(modifierSelectHandler.options[2].modifierTypeOption.type.id).toEqual("LEFTOVERS");
    expect(modifierSelectHandler.options[3].modifierTypeOption.type.id).toEqual("AMULET_COIN");
    expect(modifierSelectHandler.options[4].modifierTypeOption.type.id).toEqual("GOLDEN_PUNCH");
  });

  it("should generate custom modifier tiers that can upgrade from luck", async () => {
    await game.classicMode.startBattle(SpeciesId.ABRA, SpeciesId.VOLCARONA);
    scene.money = 1000000;
    const customModifiers: CustomModifierSettings = {
      guaranteedModifierTiers: [
        ModifierTier.COMMON,
        ModifierTier.GREAT,
        ModifierTier.ULTRA,
        ModifierTier.ROGUE,
        ModifierTier.MASTER,
      ],
    };
    const pokemon = new PlayerPokemon(
      speciesDataRegistry.getSpecies(SpeciesId.BULBASAUR),
      10,
      undefined,
      0,
      undefined,
      true,
      2,
    );

    // Fill party with max shinies
    while (scene.getPlayerParty().length > 0) {
      scene.getPlayerParty().pop();
    }
    scene.getPlayerParty().push(pokemon, pokemon, pokemon, pokemon, pokemon, pokemon);

    const selectModifierPhase = new SelectModifierPhase(0, undefined, customModifiers);
    scene.phaseManager.unshiftPhase(selectModifierPhase);
    game.move.select(MoveId.SPLASH);
    await game.phaseInterceptor.to("SelectModifierPhase");

    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    const modifierSelectHandler = scene.ui.handlers.find(
      h => h instanceof ModifierSelectUiHandler,
    ) as ModifierSelectUiHandler;
    expect(modifierSelectHandler.options.length).toEqual(5);
    expect(
      modifierSelectHandler.options[0].modifierTypeOption.type.tier
        - modifierSelectHandler.options[0].modifierTypeOption.upgradeCount,
    ).toEqual(ModifierTier.COMMON);
    expect(
      modifierSelectHandler.options[1].modifierTypeOption.type.tier
        - modifierSelectHandler.options[1].modifierTypeOption.upgradeCount,
    ).toEqual(ModifierTier.GREAT);
    expect(
      modifierSelectHandler.options[2].modifierTypeOption.type.tier
        - modifierSelectHandler.options[2].modifierTypeOption.upgradeCount,
    ).toEqual(ModifierTier.ULTRA);
    expect(
      modifierSelectHandler.options[3].modifierTypeOption.type.tier
        - modifierSelectHandler.options[3].modifierTypeOption.upgradeCount,
    ).toEqual(ModifierTier.ROGUE);
    expect(
      modifierSelectHandler.options[4].modifierTypeOption.type.tier
        - modifierSelectHandler.options[4].modifierTypeOption.upgradeCount,
    ).toEqual(ModifierTier.MASTER);
  });

  it("should generate custom modifiers and modifier tiers together", async () => {
    await game.classicMode.startBattle(SpeciesId.ABRA, SpeciesId.VOLCARONA);
    scene.money = 1000000;
    const customModifiers: CustomModifierSettings = {
      guaranteedModifierTypeFuncs: [modifierTypes.MEMORY_MUSHROOM, modifierTypes.TM_COMMON],
      guaranteedModifierTiers: [ModifierTier.MASTER, ModifierTier.MASTER],
    };
    const selectModifierPhase = new SelectModifierPhase(0, undefined, customModifiers);
    scene.phaseManager.unshiftPhase(selectModifierPhase);
    game.move.select(MoveId.SPLASH);
    await game.phaseInterceptor.to("SelectModifierPhase");

    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    const modifierSelectHandler = scene.ui.handlers.find(
      h => h instanceof ModifierSelectUiHandler,
    ) as ModifierSelectUiHandler;
    expect(modifierSelectHandler.options.length).toEqual(4);
    expect(modifierSelectHandler.options[0].modifierTypeOption.type.id).toEqual("MEMORY_MUSHROOM");
    expect(modifierSelectHandler.options[1].modifierTypeOption.type.id).toEqual("TM_COMMON");
    expect(modifierSelectHandler.options[2].modifierTypeOption.type.tier).toEqual(ModifierTier.MASTER);
    expect(modifierSelectHandler.options[3].modifierTypeOption.type.tier).toEqual(ModifierTier.MASTER);
  });

  it("should fill remaining modifiers if fillRemaining is true with custom modifiers", async () => {
    await game.classicMode.startBattle(SpeciesId.ABRA, SpeciesId.VOLCARONA);
    scene.money = 1000000;
    const customModifiers: CustomModifierSettings = {
      guaranteedModifierTypeFuncs: [modifierTypes.MEMORY_MUSHROOM],
      guaranteedModifierTiers: [ModifierTier.MASTER],
      fillRemaining: true,
    };
    const selectModifierPhase = new SelectModifierPhase(0, undefined, customModifiers);
    scene.phaseManager.unshiftPhase(selectModifierPhase);
    game.move.select(MoveId.SPLASH);
    await game.phaseInterceptor.to("SelectModifierPhase");

    expect(scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    const modifierSelectHandler = scene.ui.handlers.find(
      h => h instanceof ModifierSelectUiHandler,
    ) as ModifierSelectUiHandler;
    expect(modifierSelectHandler.options.length).toEqual(3);
    expect(modifierSelectHandler.options[0].modifierTypeOption.type.id).toEqual("MEMORY_MUSHROOM");
    expect(modifierSelectHandler.options[1].modifierTypeOption.type.tier).toEqual(ModifierTier.MASTER);
  });
});
