import type { MathChallengeMode } from "#enums/math-challenge-mode";
import type { ModalConfig } from "#types/ui-types";
import type { InputFieldConfig } from "#ui/form-modal-ui-handler";
import { FormModalUiHandler } from "#ui/form-modal-ui-handler";
import i18next from "i18next";

export interface MathChallengeConfig extends ModalConfig {
  mode: MathChallengeMode;
  expression: string;
  answerValue: number;
  answer: (correct: boolean) => void;
}

export class MathChallengeUiHandler extends FormModalUiHandler {
  getModalTitle(config?: MathChallengeConfig): string {
    return i18next.t("battle:mathChallenge.question", { expression: config?.expression });
  }

  getWidth(_config?: ModalConfig): number {
    return 225;
  }

  override getHeight(_config?: ModalConfig): number {
    return 111;
  }

  getMargin(_config?: ModalConfig): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  getButtonLabels(_config?: ModalConfig): string[] {
    return [i18next.t("menu:continue")];
  }

  override updateContainer(config?: ModalConfig): void {
    super.updateContainer(config);

    this.titleText.setWordWrapWidth((this.getWidth(config) - 20) / this.titleText.scaleX).setAlign("center");
    const buttonHeight = this.buttonBgs[0]?.height ?? 16;
    const fieldY = this.getHeight(config) - buttonHeight - 30;
    this.formLabels[0]?.setY(fieldY);
    this.inputContainers[0]?.setY(fieldY - 3);
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
      resolveAnswer(Number(this.inputs[0].text) === config.answerValue);
    };
    return true;
  }
}
