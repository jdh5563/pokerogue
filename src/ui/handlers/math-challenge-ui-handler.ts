import { MathChallengeMode } from "#enums/math-challenge-mode";
import type { ModalConfig } from "#types/ui-types";
import type { InputFieldConfig } from "#ui/form-modal-ui-handler";
import { FormModalUiHandler } from "#ui/form-modal-ui-handler";
import i18next from "i18next";

export interface MathChallengeConfig extends ModalConfig {
  mode: MathChallengeMode;
  factorA: number;
  factorB: number;
  answer: (correct: boolean) => void;
}

export class MathChallengeUiHandler extends FormModalUiHandler {
  getModalTitle(config?: MathChallengeConfig): string {
    return i18next.t(`battle:mathChallenge.${config?.mode ?? MathChallengeMode.MULTIPLICATION}`, {
      factorA: config?.factorA,
      factorB: config?.factorB,
    });
  }

  getWidth(_config?: ModalConfig): number {
    return 180;
  }

  getMargin(_config?: ModalConfig): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  getButtonLabels(_config?: ModalConfig): string[] {
    return [i18next.t("menu:continue")];
  }

  override getInputFieldConfigs(): InputFieldConfig[] {
    return [{ label: i18next.t("battle:mathChallenge.answer") }];
  }

  override show(args: any[]): boolean {
    for (const input of this.inputs) {
      input.text = "";
    }

    if (!super.show(args)) {
      return false;
    }

    setTimeout(() => {
      this.inputs[0]?.setFocus?.();
    }, 50);

    const config = args[0] as MathChallengeConfig;
    let answered = false;
    const resolveAnswer = (correct: boolean) => {
      if (answered) {
        return;
      }
      answered = true;
      config.answer(correct);
    };
    this.submitAction = () => {
      this.sanitizeInputs();
      const answer =
        config.mode === MathChallengeMode.PERCENTAGE
          ? (config.factorA / 100) * config.factorB
          : config.factorA * config.factorB;
      resolveAnswer(Number(this.inputs[0].text) === answer);
    };
    return true;
  }
}
