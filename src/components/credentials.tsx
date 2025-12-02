import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCredentialsStore } from "@/lib/stores";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./ui/input-group";
import { Label } from "./ui/label";

export function CredentialsCard({
  showErrors = false,
}: {
  showErrors?: boolean;
}) {
  const { isTornKeyValid, isFFScouterKeyValid } = useCredentialsStore();

  const hasErrors =
    showErrors && (isTornKeyValid === false || isFFScouterKeyValid === false);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Credentials</CardTitle>
        <CardDescription>
          {hasErrors
            ? "Your stored credentials are invalid. Please update them."
            : "Enter your API key to get started"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasErrors && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
              Invalid Credentials Detected
            </p>
            <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
              {isTornKeyValid === false && (
                <li>Torn Limited Access API Key is invalid or expired</li>
              )}
              {isFFScouterKeyValid === false && (
                <li>FFScouter API Key is invalid or expired</li>
              )}
            </ul>
          </div>
        )}
        <CredentialsInput />
      </CardContent>
    </Card>
  );
}

type ValidationState = "idle" | "validating" | "valid" | "invalid";

export const validateTornKey = async (key: string): Promise<boolean> => {
  try {
    const url = "https://api.torn.com/v2/faction/chain";
    const params = new URLSearchParams();
    params.set("key", key);

    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();

    // Torn API returns error object if key is invalid or doesn't have access
    return !data.error;
  } catch {
    return false;
  }
};

export const validateFFScouterKey = async (key: string): Promise<boolean> => {
  try {
    const url = "https://ffscouter.com/api/v1/get-stats";
    const params = new URLSearchParams();
    params.set("key", key);
    params.set("targets", "1"); // Test with a dummy target

    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();

    // FFScouter returns error if key is invalid
    return !data.error;
  } catch {
    return false;
  }
};

export function CredentialsInput() {
  const {
    publicKey,
    setPublicKey,
    ffscouterKey,
    setFFScouterKey,
    isTornKeyValid,
    isFFScouterKeyValid,
    setTornKeyValidation,
    setFFScouterKeyValidation,
  } = useCredentialsStore();

  const [publicKeyInput, setPublicKeyInput] = useState<string | undefined>(
    publicKey
  );
  const [ffscouterKeyInput, setFFScouterKeyInput] = useState<
    string | undefined
  >(ffscouterKey);

  const [tornValidation, setTornValidation] = useState<ValidationState>("idle");
  const [ffscouterValidation, setFFScouterValidation] =
    useState<ValidationState>("idle");

  const [showTornKey, setShowTornKey] = useState(false);
  const [showFFScouterKey, setShowFFScouterKey] = useState(false);

  // Validate stored credentials on mount if they exist but haven't been validated
  useEffect(() => {
    const validateStoredCredentials = async () => {
      // Validate Torn key if present and not yet validated
      if (publicKey && isTornKeyValid === undefined) {
        const isValid = await validateTornKey(publicKey);
        setTornKeyValidation(isValid);
      }

      // Validate FFScouter key if present and not yet validated
      if (ffscouterKey && isFFScouterKeyValid === undefined) {
        const isValid = await validateFFScouterKey(ffscouterKey);
        setFFScouterKeyValidation(isValid);
      }
    };

    validateStoredCredentials();
  }, [
    publicKey,
    ffscouterKey,
    isTornKeyValid,
    isFFScouterKeyValid,
    setTornKeyValidation,
    setFFScouterKeyValidation,
  ]);

  const handleValidateTorn = async () => {
    if (!publicKeyInput) return;

    setTornValidation("validating");
    const isValid = await validateTornKey(publicKeyInput);
    setTornValidation(isValid ? "valid" : "invalid");
  };

  const handleValidateFFScouter = async () => {
    if (!ffscouterKeyInput) return;

    setFFScouterValidation("validating");
    const isValid = await validateFFScouterKey(ffscouterKeyInput);
    setFFScouterValidation(isValid ? "valid" : "invalid");
  };

  const getValidationIcon = (state: ValidationState) => {
    switch (state) {
      case "validating":
        return <Loader2 className="size-3.5 animate-spin" />;
      case "valid":
        return (
          <Check className="size-3.5 text-green-600 dark:text-green-400" />
        );
      case "invalid":
        return <X className="size-3.5 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const formatDisplayValue = (
    value: string | undefined,
    isVisible: boolean
  ): string => {
    if (!value) return "";
    if (isVisible) return value;
    if (value.length <= 3) return value;
    const firstThree = value.slice(0, 3);
    const masked = "•".repeat(value.length - 3);
    return firstThree + masked;
  };

  const handleTornKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Remove mask characters and use the actual typed value
    const cleanValue = newValue.replace(/•/g, "");
    setPublicKeyInput(cleanValue);
    setTornValidation("idle");
  };

  const handleFFScouterKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Remove mask characters and use the actual typed value
    const cleanValue = newValue.replace(/•/g, "");
    setFFScouterKeyInput(cleanValue);
    setFFScouterValidation("idle");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="torn-key">Torn Limited Access API Key</Label>
        <InputGroup
          aria-invalid={tornValidation === "invalid"}
          className={
            tornValidation === "valid"
              ? "border-green-600 dark:border-green-400"
              : ""
          }
        >
          <InputGroupInput
            id="torn-key"
            type="text"
            placeholder="Your Torn Limited Access API Key"
            value={formatDisplayValue(publicKeyInput, showTornKey)}
            onChange={handleTornKeyChange}
          />
          <InputGroupAddon align="inline-end">
            {getValidationIcon(tornValidation)}
            <InputGroupButton
              onClick={() => setShowTornKey(!showTornKey)}
              type="button"
              aria-label={showTornKey ? "Hide key" : "Show key"}
            >
              {showTornKey ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </InputGroupButton>
            <InputGroupButton
              onClick={handleValidateTorn}
              disabled={!publicKeyInput || tornValidation === "validating"}
            >
              Validate
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ffscouter-key">
          FFScouter API Key{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <InputGroup
          aria-invalid={ffscouterValidation === "invalid"}
          className={
            ffscouterValidation === "valid"
              ? "border-green-600 dark:border-green-400"
              : ""
          }
        >
          <InputGroupInput
            id="ffscouter-key"
            type="text"
            placeholder="Your FFScouter API Key"
            value={formatDisplayValue(ffscouterKeyInput, showFFScouterKey)}
            onChange={handleFFScouterKeyChange}
          />
          <InputGroupAddon align="inline-end">
            {getValidationIcon(ffscouterValidation)}
            <InputGroupButton
              onClick={() => setShowFFScouterKey(!showFFScouterKey)}
              type="button"
              aria-label={showFFScouterKey ? "Hide key" : "Show key"}
            >
              {showFFScouterKey ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </InputGroupButton>
            <InputGroupButton
              onClick={handleValidateFFScouter}
              disabled={
                !ffscouterKeyInput || ffscouterValidation === "validating"
              }
            >
              Validate
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
      {tornValidation === "invalid" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Torn Limited Access API Key is invalid. Please validate it before
          setting credentials.
        </p>
      )}
      {ffscouterKeyInput && ffscouterValidation === "invalid" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          FFScouter API Key is invalid. Please validate it before setting
          credentials.
        </p>
      )}
      <Button
        onClick={() => {
          // Only set Torn key if it's valid
          if (publicKeyInput && tornValidation === "valid") {
            setPublicKey(publicKeyInput, true);
          }

          // Handle FFScouter key (optional)
          if (ffscouterKeyInput) {
            // Only set if validated and valid
            if (ffscouterValidation === "valid") {
              setFFScouterKey(ffscouterKeyInput, true);
            }
            // If invalid, don't set it (early return handled by disabled state)
          } else {
            // Clear FFScouter key if input is empty
            setFFScouterKey(undefined, true);
          }
        }}
        disabled={
          !publicKeyInput ||
          tornValidation !== "valid" ||
          (!!ffscouterKeyInput && ffscouterValidation === "invalid")
        }
      >
        Set Credentials
      </Button>
    </div>
  );
}
