import { audioManager } from "#app/global-audio-manager";
import { globalScene } from "#app/global-scene";
import { activeOverrides } from "#app/overrides";
import { MathChallengeMode } from "#enums/math-challenge-mode";
import { ModifierPoolType } from "#enums/modifier-pool-type";
import type { ModifierTier } from "#enums/modifier-tier";
import { PartyUiMode } from "#enums/party-ui-mode";
import { UiMode } from "#enums/ui-mode";
import type { Modifier } from "#modifiers/modifier";
import {
  ExtraModifierModifier,
  HealShopCostModifier,
  PokemonHeldItemModifier,
  TempExtraModifierModifier,
} from "#modifiers/modifier";
import type { CustomModifierSettings, ModifierType, ModifierTypeOption } from "#modifiers/modifier-type";
import {
  FusePokemonModifierType,
  getPlayerModifierTypeOptions,
  getPlayerShopModifierTypeOptionsForWave,
  PokemonModifierType,
  PokemonMoveModifierType,
  PokemonPpRestoreModifierType,
  PokemonPpUpModifierType,
  RememberMoveModifierType,
  regenerateModifierPoolThresholds,
  TmModifierType,
  upgradeModifierTypeOption,
} from "#modifiers/modifier-type";
import { BattlePhase } from "#phases/battle-phase";
import type { ConfirmModeConfig } from "#types/ui-types";
import type { MathChallengeConfig } from "#ui/math-challenge-ui-handler";
import type { ModifierSelectUiHandler } from "#ui/modifier-select-ui-handler";
import { SHOP_OPTIONS_ROW_LIMIT } from "#ui/modifier-select-ui-handler";
import { PartyOption, PartyUiHandler } from "#ui/party-ui-handler";
import { NumberHolder, randSeedInt, randSeedIntRange } from "#utils/common";
import i18next from "i18next";

export type ModifierSelectCallback = (rowCursor: number, cursor: number) => boolean;

export function getMathChallengeMaxFactor(waveIndex: number): number {
  const progression = Math.max(0, waveIndex - 1);
  return Math.min(100, 12 + Math.floor((progression * 88) / 149));
}

const ORDER_OPERATORS = ["+", "-", "x", "÷"] as const;

export function evaluateOrderOfOperations(expression: string): number {
  const tokens = expression.match(/\d+|[()+\-x÷]/g) ?? [];
  let position = 0;

  const parseExpression = (): number => {
    let value = parseTerm();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parsePrimary();
    while (tokens[position] === "x" || tokens[position] === "÷") {
      const operator = tokens[position++];
      const right = parsePrimary();
      if (operator === "÷") {
        if (right === 0 || value % right !== 0) {
          throw new Error("Invalid division");
        }
        value /= right;
      } else {
        value *= right;
      }
    }
    return value;
  };

  const parsePrimary = (): number => {
    if (tokens[position] === "(") {
      position++;
      const value = parseExpression();
      if (tokens[position++] !== ")") {
        throw new Error("Unmatched parenthesis");
      }
      return value;
    }
    const value = Number(tokens[position++]);
    if (!Number.isInteger(value)) {
      throw new Error("Invalid number");
    }
    return value;
  };

  const answer = parseExpression();
  if (position !== tokens.length) {
    throw new Error("Unexpected token");
  }
  return answer;
}

export function generateOrderOfOperationsProblem(): { expression: string; answerValue: number } {
  for (let attempt = 0; attempt < 100; attempt++) {
    const numberCount = randSeedIntRange(3, 6);
    const numbers = Array.from({ length: numberCount }, () => randSeedIntRange(1, 12));
    const operators = Array.from(
      { length: numberCount - 1 },
      () => ORDER_OPERATORS[randSeedInt(ORDER_OPERATORS.length)],
    );
    let expression = "";
    let index = 0;
    while (index < numberCount) {
      const canGroup = index < numberCount - 1 && randSeedInt(2) === 0;
      if (canGroup) {
        expression += `(${numbers[index]}${operators[index]}${numbers[index + 1]})`;
        index += 2;
      } else {
        expression += numbers[index];
        index++;
      }
      if (index < numberCount) {
        expression += operators[index - 1];
      }
    }
    try {
      return { expression, answerValue: evaluateOrderOfOperations(expression) };
    } catch {}
  }
  return { expression: "1+1+1", answerValue: 3 };
}

export function generateAdditionSubtractionProblem(): { expression: string; answerValue: number } {
  const generateNumber = () => {
    const min = randSeedInt(2) === 0 ? 100 : 1000;
    return randSeedIntRange(min, min === 100 ? 999 : 9999);
  };
  const left = generateNumber();
  const right = generateNumber();
  const operator = randSeedInt(2) === 0 ? "+" : "-";

  return {
    expression: `${left} ${operator} ${right}`,
    answerValue: operator === "+" ? left + right : left - right,
  };
}

const UNIT_CONVERSIONS = [
  "feetToInches",
  "inchesToFeet",
  "metersToCentimeters",
  "centimetersToMeters",
  "kilometersToMeters",
  "metersToKilometers",
  "kilogramsToGrams",
  "gramsToKilograms",
] as const;

function roundMeasurement(value: number): number {
  return Number(value.toFixed(3));
}

export function generateUnitConversionProblem(): { expression: string; answerValue: number } {
  const conversion = UNIT_CONVERSIONS[randSeedInt(UNIT_CONVERSIONS.length)];
  switch (conversion) {
    case "feetToInches": {
      const feet = randSeedIntRange(1, 20);
      const inches = randSeedIntRange(0, 11);
      const expression = inches ? `${feet} feet and ${inches} inches` : `${feet} feet`;
      return { expression: `${expression} converted to inches`, answerValue: feet * 12 + inches };
    }
    case "inchesToFeet": {
      const inches = randSeedIntRange(1, 240);
      return { expression: `${inches} inches converted to feet`, answerValue: roundMeasurement(inches / 12) };
    }
    case "metersToCentimeters": {
      const meters = randSeedIntRange(1, 1000);
      return { expression: `${meters} meters converted to centimeters`, answerValue: meters * 100 };
    }
    case "centimetersToMeters": {
      const centimeters = randSeedIntRange(1, 1000);
      return {
        expression: `${centimeters} centimeters converted to meters`,
        answerValue: roundMeasurement(centimeters / 100),
      };
    }
    case "kilometersToMeters": {
      const kilometers = roundMeasurement(randSeedIntRange(1, 100000) / 1000);
      return {
        expression: `${kilometers} kilometers converted to meters`,
        answerValue: roundMeasurement(kilometers * 1000),
      };
    }
    case "metersToKilometers": {
      const meters = randSeedIntRange(1, 1000);
      return { expression: `${meters} meters converted to kilometers`, answerValue: roundMeasurement(meters / 1000) };
    }
    case "kilogramsToGrams": {
      const kilograms = roundMeasurement(randSeedIntRange(1, 100000) / 1000);
      return {
        expression: `${kilograms} kilograms converted to grams`,
        answerValue: roundMeasurement(kilograms * 1000),
      };
    }
    case "gramsToKilograms": {
      const grams = randSeedIntRange(1, 100000);
      return { expression: `${grams} grams converted to kilograms`, answerValue: roundMeasurement(grams / 1000) };
    }
  }
}

export function generateDivisionProblem(waveIndex: number): { expression: string; answerValue: number } {
  const dividendMax = waveIndex <= 50 ? 100 : waveIndex <= 100 ? 500 : 1000;
  const divisorMax = waveIndex <= 50 ? 12 : waveIndex <= 100 ? 25 : 50;

  for (let attempt = 0; attempt < 100; attempt++) {
    const dividend = randSeedIntRange(10, dividendMax);
    const divisor = randSeedIntRange(2, divisorMax);
    if (dividend % divisor === 0 && dividend / divisor > 1) {
      return { expression: `${dividend} ÷ ${divisor}`, answerValue: dividend / divisor };
    }
  }

  return { expression: "4 ÷ 2", answerValue: 2 };
}

function generateMathChallengeProblem(
  mode: MathChallengeMode,
  maxFactor: number,
): {
  expression: string;
  answerValue: number;
} {
  if (mode === MathChallengeMode.ORDER_OF_OPERATIONS) {
    return generateOrderOfOperationsProblem();
  }
  if (mode === MathChallengeMode.ADDITION_SUBTRACTION) {
    return generateAdditionSubtractionProblem();
  }
  if (mode === MathChallengeMode.UNIT_CONVERSION) {
    return generateUnitConversionProblem();
  }
  if (mode === MathChallengeMode.DIVISION) {
    return generateDivisionProblem(globalScene.currentBattle.waveIndex);
  }
  if (mode === MathChallengeMode.PERCENTAGE) {
    const factorA = randSeedIntRange(1, 99);
    const factorB = randSeedIntRange(1, 1000);
    return { expression: `${factorA}% of ${factorB}`, answerValue: (factorA / 100) * factorB };
  }
  const factorA = randSeedIntRange(2, maxFactor);
  const factorB = randSeedIntRange(2, maxFactor);
  return { expression: `${factorA} * ${factorB}`, answerValue: factorA * factorB };
}

export class SelectModifierPhase extends BattlePhase {
  public readonly phaseName = "SelectModifierPhase";
  private readonly rerollCount: number;
  private readonly modifierTiers?: ModifierTier[] | undefined;
  private readonly customModifierSettings?: CustomModifierSettings | undefined;
  private readonly isCopy: boolean;

  private typeOptions: ModifierTypeOption[];

  constructor(
    rerollCount = 0,
    modifierTiers?: ModifierTier[],
    customModifierSettings?: CustomModifierSettings,
    isCopy = false,
  ) {
    super();

    this.rerollCount = rerollCount;
    this.modifierTiers = modifierTiers;
    this.customModifierSettings = customModifierSettings;
    this.isCopy = isCopy;
  }

  start() {
    super.start();

    if (!this.isPlayer()) {
      return false;
    }

    if (!this.rerollCount && !this.isCopy) {
      this.updateSeed();
    } else if (this.rerollCount) {
      globalScene.reroll = false;
    }

    const party = globalScene.getPlayerParty();
    if (!this.isCopy) {
      regenerateModifierPoolThresholds(party, this.getPoolType(), this.rerollCount);
    }
    const modifierCount = this.getModifierCount();

    this.typeOptions = this.getModifierTypeOptions(modifierCount);

    const modifierSelectCallback = (rowCursor: number, cursor: number) => {
      if (rowCursor < 0 || cursor < 0) {
        globalScene.ui.showText(i18next.t("battle:skipItemQuestion"), null, () => {
          const skipRewardConfirmOptions: ConfirmModeConfig = {
            yesHandler: () => {
              globalScene.ui.revertMode();
              globalScene.ui.setMode(UiMode.MESSAGE);
              super.end();
            },
            noHandler: () => this.resetModifierSelect(modifierSelectCallback),
          };
          globalScene.ui.setOverlayMode(UiMode.CONFIRM, skipRewardConfirmOptions);
        });
        return false;
      }

      switch (rowCursor) {
        // Execute one of the options from the bottom row
        case 0:
          switch (cursor) {
            case 0:
              return this.rerollModifiers();
            case 1:
              return this.openModifierTransferScreen(modifierSelectCallback);
            // Check the party, pass a callback to restore the modifier select screen.
            case 2:
              globalScene.ui.setModeWithoutClear(UiMode.PARTY, PartyUiMode.CHECK, -1, () => {
                this.resetModifierSelect(modifierSelectCallback);
              });
              return true;
            case 3:
              return this.toggleRerollLock();
            default:
              return false;
          }
        // Pick an option from the rewards
        case 1:
          return this.selectRewardModifierOption(cursor, modifierSelectCallback);
        // Pick an option from the shop
        default: {
          return this.selectShopModifierOption(rowCursor, cursor, modifierSelectCallback);
        }
      }
    };

    const hasShop = globalScene.gameMode.getShopStatus();
    const hasShopOptions =
      getPlayerShopModifierTypeOptionsForWave(globalScene.currentBattle.waveIndex, globalScene.getWaveMoneyAmount(1))
        .length > 0;
    if (
      !this.customModifierSettings
      && !this.isCopy
      && hasShop
      && hasShopOptions
      && this.typeOptions.some(option => option.cost === 0)
    ) {
      const selectedModes =
        globalScene.mathChallengeModes.length > 0 ? globalScene.mathChallengeModes : [MathChallengeMode.MULTIPLICATION];
      const mode = selectedModes[randSeedInt(selectedModes.length)];
      const maxFactor = getMathChallengeMaxFactor(globalScene.currentBattle.waveIndex);
      const problem = generateMathChallengeProblem(mode, maxFactor);
      const challengeConfig: MathChallengeConfig = {
        mode,
        ...problem,
        buttonActions: [],
        answer: correct => {
          if (correct) {
            this.typeOptions = this.typeOptions.map(option =>
              option.cost === 0 ? upgradeModifierTypeOption(option) : option,
            );
          }
          this.resetModifierSelect(modifierSelectCallback);
        },
      };
      globalScene.ui.setModeWithoutClear(UiMode.MATH_CHALLENGE, challengeConfig);
      return;
    }

    this.resetModifierSelect(modifierSelectCallback);
  }

  // Pick a modifier from among the rewards and apply it
  private selectRewardModifierOption(cursor: number, modifierSelectCallback: ModifierSelectCallback): boolean {
    if (this.typeOptions.length === 0) {
      globalScene.ui.clearText();
      globalScene.ui.setMode(UiMode.MESSAGE);
      super.end();
      return true;
    }
    const modifierType = this.typeOptions[cursor].type;
    return this.applyChosenModifier(modifierType, -1, modifierSelectCallback);
  }

  // Pick a modifier from the shop and apply it
  private selectShopModifierOption(
    rowCursor: number,
    cursor: number,
    modifierSelectCallback: ModifierSelectCallback,
  ): boolean {
    const shopOptions = getPlayerShopModifierTypeOptionsForWave(
      globalScene.currentBattle.waveIndex,
      globalScene.getWaveMoneyAmount(1),
    );
    const shopOption =
      shopOptions[
        rowCursor > 2 || shopOptions.length <= SHOP_OPTIONS_ROW_LIMIT ? cursor : cursor + SHOP_OPTIONS_ROW_LIMIT
      ];
    const modifierType = shopOption.type;
    // Apply Black Sludge to healing item cost
    const healingItemCost = new NumberHolder(shopOption.cost);
    globalScene.applyModifier(HealShopCostModifier, true, healingItemCost);
    const cost = healingItemCost.value;

    if (globalScene.money < cost && !activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
      globalScene.ui.playError();
      return false;
    }

    return this.applyChosenModifier(modifierType, cost, modifierSelectCallback);
  }

  // Apply a chosen modifier: do an effect or open the party menu
  private applyChosenModifier(
    modifierType: ModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
  ): boolean {
    if (modifierType instanceof PokemonModifierType) {
      if (modifierType instanceof FusePokemonModifierType) {
        this.openFusionMenu(modifierType, cost, modifierSelectCallback);
      } else {
        this.openModifierMenu(modifierType, cost, modifierSelectCallback);
      }
    } else {
      this.applyModifier(modifierType.newModifier()!, cost);
    }
    return cost === -1;
  }

  // Reroll rewards
  private rerollModifiers() {
    const rerollCost = this.getRerollCost(globalScene.lockModifierTiers);
    if (rerollCost < 0 || globalScene.money < rerollCost) {
      globalScene.ui.playError();
      return false;
    }
    globalScene.reroll = true;
    globalScene.phaseManager.unshiftNew(
      "SelectModifierPhase",
      this.rerollCount + 1,
      this.typeOptions.map(o => o.type?.tier).filter(t => t !== undefined) as ModifierTier[],
    );
    globalScene.ui.clearText();
    globalScene.ui.setMode(UiMode.MESSAGE).then(() => super.end());
    if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
      globalScene.money -= rerollCost;
      globalScene.updateMoneyText();
      globalScene.animateMoneyChanged(false);
    }
    audioManager.playSound("se/buy");
    return true;
  }

  // Transfer modifiers among party pokemon
  private openModifierTransferScreen(modifierSelectCallback: ModifierSelectCallback) {
    const party = globalScene.getPlayerParty();
    globalScene.ui.setModeWithoutClear(
      UiMode.PARTY,
      PartyUiMode.MODIFIER_TRANSFER,
      -1,
      (fromSlotIndex: number, itemIndex: number, itemQuantity: number, toSlotIndex: number) => {
        if (
          toSlotIndex !== undefined
          && fromSlotIndex < 6
          && toSlotIndex < 6
          && fromSlotIndex !== toSlotIndex
          && itemIndex > -1
        ) {
          const itemModifiers = globalScene.findModifiers(
            m => m instanceof PokemonHeldItemModifier && m.isTransferable && m.pokemonId === party[fromSlotIndex].id,
          ) as PokemonHeldItemModifier[];
          const itemModifier = itemModifiers[itemIndex];
          globalScene.tryTransferHeldItemModifier(
            itemModifier,
            party[toSlotIndex],
            true,
            itemQuantity,
            undefined,
            undefined,
            false,
          );
        } else {
          this.resetModifierSelect(modifierSelectCallback);
        }
      },
      PartyUiHandler.FilterItemMaxStacks,
    );
    return true;
  }

  // Toggle reroll lock
  private toggleRerollLock() {
    const rerollCost = this.getRerollCost(globalScene.lockModifierTiers);
    if (rerollCost < 0) {
      // Reroll lock button is also disabled when reroll is disabled
      globalScene.ui.playError();
      return false;
    }
    globalScene.lockModifierTiers = !globalScene.lockModifierTiers;
    const uiHandler = globalScene.ui.getHandler() as ModifierSelectUiHandler;
    uiHandler.setRerollCost(this.getRerollCost(globalScene.lockModifierTiers));
    uiHandler.updateLockRaritiesText();
    uiHandler.updateRerollCostText();
    return false;
  }

  /**
   * Apply the effects of the chosen modifier
   * @param modifier - The modifier to apply
   * @param cost - The cost of the modifier if it was purchased, or -1 if selected as the modifier reward
   * @param playSound - Whether the 'obtain modifier' sound should be played when adding the modifier.
   */
  private applyModifier(modifier: Modifier, cost = -1, playSound = false): void {
    const result = globalScene.addModifier(modifier, false, playSound, undefined, undefined, cost);
    // Queue a copy of this phase when applying a TM or Memory Mushroom.
    // If the player selects either of these, then escapes out of consuming them,
    // they are returned to a shop in the same state.
    if (modifier.type instanceof RememberMoveModifierType || modifier.type instanceof TmModifierType) {
      globalScene.phaseManager.unshiftPhase(this.copy());
    }

    if (cost !== -1 && !(modifier.type instanceof RememberMoveModifierType)) {
      if (result) {
        if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
          globalScene.money -= cost;
          globalScene.updateMoneyText();
          globalScene.animateMoneyChanged(false);
        }
        audioManager.playSound("se/buy");
        (globalScene.ui.getHandler() as ModifierSelectUiHandler).updateCostText();
      } else {
        globalScene.ui.playError();
      }
    } else {
      globalScene.ui.clearText();
      globalScene.ui.setMode(UiMode.MESSAGE);
      super.end();
    }
  }

  // Opens the party menu specifically for fusions
  private openFusionMenu(
    modifierType: PokemonModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
  ): void {
    const party = globalScene.getPlayerParty();
    globalScene.ui.setModeWithoutClear(
      UiMode.PARTY,
      PartyUiMode.SPLICE,
      -1,
      (fromSlotIndex: number, spliceSlotIndex: number) => {
        if (
          spliceSlotIndex !== undefined
          && fromSlotIndex < 6
          && spliceSlotIndex < 6
          && fromSlotIndex !== spliceSlotIndex
        ) {
          globalScene.ui.setMode(UiMode.MODIFIER_SELECT, this.isPlayer()).then(() => {
            const modifier = modifierType.newModifier(party[fromSlotIndex], party[spliceSlotIndex])!; //TODO: is the bang correct?
            this.applyModifier(modifier, cost, true);
          });
        } else {
          this.resetModifierSelect(modifierSelectCallback);
        }
      },
      modifierType.selectFilter,
    );
  }

  // Opens the party menu to apply one of various modifiers
  private openModifierMenu(
    modifierType: PokemonModifierType,
    cost: number,
    modifierSelectCallback: ModifierSelectCallback,
  ): void {
    const party = globalScene.getPlayerParty();
    const pokemonModifierType = modifierType as PokemonModifierType;
    const isMoveModifier = modifierType instanceof PokemonMoveModifierType;
    const isTmModifier = modifierType instanceof TmModifierType;
    const isRememberMoveModifier = modifierType instanceof RememberMoveModifierType;
    const isPpRestoreModifier =
      modifierType instanceof PokemonPpRestoreModifierType || modifierType instanceof PokemonPpUpModifierType;
    const partyUiMode = isMoveModifier
      ? PartyUiMode.MOVE_MODIFIER
      : isTmModifier
        ? PartyUiMode.TM_MODIFIER
        : isRememberMoveModifier
          ? PartyUiMode.REMEMBER_MOVE_MODIFIER
          : PartyUiMode.MODIFIER;
    const tmMoveId = isTmModifier ? (modifierType as TmModifierType).moveId : undefined;
    globalScene.ui.setModeWithoutClear(
      UiMode.PARTY,
      partyUiMode,
      -1,
      (slotIndex: number, option: PartyOption) => {
        if (slotIndex < 6) {
          globalScene.ui.setMode(UiMode.MODIFIER_SELECT, this.isPlayer()).then(() => {
            const modifier = isMoveModifier
              ? modifierType.newModifier(party[slotIndex], option - PartyOption.MOVE_1)
              : isRememberMoveModifier
                ? modifierType.newModifier(party[slotIndex], option as number)
                : modifierType.newModifier(party[slotIndex]);
            this.applyModifier(modifier!, cost, true); // TODO: is the bang correct?
          });
        } else {
          this.resetModifierSelect(modifierSelectCallback);
        }
      },
      pokemonModifierType.selectFilter,
      modifierType instanceof PokemonMoveModifierType
        ? (modifierType as PokemonMoveModifierType).moveSelectFilter
        : undefined,
      tmMoveId,
      isPpRestoreModifier,
    );
  }

  // Function that determines how many reward slots are available
  private getModifierCount(): number {
    const modifierCountHolder = new NumberHolder(3);
    globalScene.applyModifiers(ExtraModifierModifier, true, modifierCountHolder);
    globalScene.applyModifiers(TempExtraModifierModifier, true, modifierCountHolder);

    // If custom modifiers are specified, overrides default item count
    if (this.customModifierSettings) {
      const newItemCount =
        (this.customModifierSettings.guaranteedModifierTiers?.length ?? 0)
        + (this.customModifierSettings.guaranteedModifierTypeOptions?.length ?? 0)
        + (this.customModifierSettings.guaranteedModifierTypeFuncs?.length ?? 0);
      if (this.customModifierSettings.fillRemaining) {
        const originalCount = modifierCountHolder.value;
        modifierCountHolder.value = originalCount > newItemCount ? originalCount : newItemCount;
      } else {
        modifierCountHolder.value = newItemCount;
      }
    }

    return modifierCountHolder.value;
  }

  // Function that resets the reward selection screen,
  // e.g. after pressing cancel in the party ui or while learning a move
  private resetModifierSelect(modifierSelectCallback: ModifierSelectCallback) {
    globalScene.ui.setMode(
      UiMode.MODIFIER_SELECT,
      this.isPlayer(),
      this.typeOptions,
      modifierSelectCallback,
      this.getRerollCost(globalScene.lockModifierTiers),
    );
  }

  updateSeed(): void {
    globalScene.resetSeed();
  }

  isPlayer(): boolean {
    return true;
  }

  getRerollCost(lockRarities: boolean): number {
    let baseValue = 0;
    if (activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
      return baseValue;
    }
    if (lockRarities) {
      const tierValues = [50, 125, 300, 750, 2000];
      for (const opt of this.typeOptions) {
        baseValue += tierValues[opt.type.tier ?? 0];
      }
    } else {
      baseValue = 250;
    }

    let multiplier = 1;
    if (this.customModifierSettings?.rerollMultiplier != null) {
      if (this.customModifierSettings.rerollMultiplier < 0) {
        // Completely overrides reroll cost to -1 and early exits
        return -1;
      }

      // Otherwise, continue with custom multiplier
      multiplier = this.customModifierSettings.rerollMultiplier;
    }

    const baseMultiplier = Math.min(
      Math.ceil(globalScene.currentBattle.waveIndex / 10) * baseValue * 2 ** this.rerollCount * multiplier,
      Number.MAX_SAFE_INTEGER,
    );

    // Apply Black Sludge to reroll cost
    const modifiedRerollCost = new NumberHolder(baseMultiplier);
    globalScene.applyModifier(HealShopCostModifier, true, modifiedRerollCost);
    return modifiedRerollCost.value;
  }

  getPoolType(): ModifierPoolType {
    return ModifierPoolType.PLAYER;
  }

  getModifierTypeOptions(modifierCount: number): ModifierTypeOption[] {
    return getPlayerModifierTypeOptions(
      modifierCount,
      globalScene.getPlayerParty(),
      globalScene.lockModifierTiers ? this.modifierTiers : undefined,
      this.customModifierSettings,
    );
  }

  copy(): SelectModifierPhase {
    return globalScene.phaseManager.create(
      "SelectModifierPhase",
      this.rerollCount,
      this.modifierTiers,
      {
        guaranteedModifierTypeOptions: this.typeOptions,
        rerollMultiplier: this.customModifierSettings?.rerollMultiplier,
        allowLuckUpgrades: false,
      },
      true,
    );
  }

  addModifier(modifier: Modifier): boolean {
    return globalScene.addModifier(modifier, false, true);
  }
}
