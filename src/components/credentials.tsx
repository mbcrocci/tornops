import { Check, Eye, EyeOff, Info, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCredentialsStore } from "@/lib/stores";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./ui/input-group";
import { Label } from "./ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function CredentialsCard({ showErrors = false }: { showErrors?: boolean }) {
  const { isTornKeyValid, isFFScouterKeyValid } = useCredentialsStore();

  const hasErrors = showErrors && (isTornKeyValid === false || isFFScouterKeyValid === false);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Login</CardTitle>
        <CardDescription>
          {hasErrors
            ? "Your stored credentials are invalid. Please update them."
            : "Enter your Torn API key, then validate to log in. FFScouter is optional."}
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
              {isFFScouterKeyValid === false && <li>FFScouter API Key is invalid or expired</li>}
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
    return (
      response.ok &&
      !!data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      !data.error &&
      !!data.chain
    );
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
    return response.ok && Array.isArray(data);
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

  const [publicKeyInput, setPublicKeyInput] = useState<string | undefined>(publicKey);
  const [ffscouterKeyInput, setFFScouterKeyInput] = useState<string | undefined>(ffscouterKey);

  const [tornValidation, setTornValidation] = useState<ValidationState>("idle");
  const [ffscouterValidation, setFFScouterValidation] = useState<ValidationState>("idle");

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

  const [isValidating, setIsValidating] = useState(false);
  const validationInFlight = useRef(false);

  const handleValidate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!publicKeyInput?.trim() || validationInFlight.current) return;

    const tornKey = publicKeyInput.trim();
    const scouterKey = ffscouterKeyInput?.trim();
    validationInFlight.current = true;
    setIsValidating(true);
    setTornValidation("validating");
    setFFScouterValidation(scouterKey ? "validating" : "idle");

    try {
      const [tornValid, scouterValid] = await Promise.all([
        validateTornKey(tornKey),
        scouterKey ? validateFFScouterKey(scouterKey) : Promise.resolve(true),
      ]);
      setTornValidation(tornValid ? "valid" : "invalid");
      setFFScouterValidation(scouterKey ? (scouterValid ? "valid" : "invalid") : "idle");

      if (tornValid && scouterValid) {
        setFFScouterKey(scouterKey, true);
        setPublicKey(tornKey, true);
      }
    } finally {
      validationInFlight.current = false;
      setIsValidating(false);
    }
  };

  const getValidationIcon = (state: ValidationState) => {
    switch (state) {
      case "validating":
        return <Loader2 className="size-3.5 animate-spin" />;
      case "valid":
        return <Check className="size-3.5 text-green-600 dark:text-green-400" />;
      case "invalid":
        return <X className="size-3.5 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const handleTornKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setPublicKeyInput(newValue);
    setTornValidation("idle");
  };

  const handleFFScouterKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setFFScouterKeyInput(newValue);
    setFFScouterValidation("idle");
  };

  return (
    <form onSubmit={handleValidate} className="flex flex-col gap-4" aria-busy={isValidating}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="torn-key">Torn Limited Access API Key</Label>
          <KeyHelp label="About the Torn API key">
            Reads your player status, faction members, chains, and attack history. Use a Torn key
            with Limited Access for more features.
          </KeyHelp>
        </div>
        <InputGroup
          aria-invalid={tornValidation === "invalid"}
          className={tornValidation === "valid" ? "border-green-600 dark:border-green-400" : ""}
        >
          <InputGroupInput
            id="torn-key"
            aria-invalid={tornValidation === "invalid"}
            type={showTornKey ? "text" : "password"}
            placeholder="Your Torn Limited Access API Key"
            value={publicKeyInput ?? ""}
            disabled={isValidating}
            onChange={handleTornKeyChange}
          />
          <InputGroupAddon align="inline-end">
            {getValidationIcon(tornValidation)}
            <InputGroupButton
              onClick={() => setShowTornKey(!showTornKey)}
              type="button"
              aria-label={showTornKey ? "Hide key" : "Show key"}
            >
              {showTornKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="ffscouter-key">
            FFScouter API Key <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <KeyHelp label="About the FFScouter API key">
            Adds estimated battle stats, fair fight scores, and player and faction activity history
            from FFScouter. Leave it blank to use TornOps without these features.
          </KeyHelp>
        </div>
        <InputGroup
          aria-invalid={ffscouterValidation === "invalid"}
          className={
            ffscouterValidation === "valid" ? "border-green-600 dark:border-green-400" : ""
          }
        >
          <InputGroupInput
            id="ffscouter-key"
            aria-invalid={ffscouterValidation === "invalid"}
            type={showFFScouterKey ? "text" : "password"}
            placeholder="Your FFScouter API Key"
            value={ffscouterKeyInput ?? ""}
            disabled={isValidating}
            onChange={handleFFScouterKeyChange}
          />
          <InputGroupAddon align="inline-end">
            {getValidationIcon(ffscouterValidation)}
            <InputGroupButton
              onClick={() => setShowFFScouterKey(!showFFScouterKey)}
              type="button"
              aria-label={showFFScouterKey ? "Hide key" : "Show key"}
            >
              {showFFScouterKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
      {tornValidation === "invalid" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not validate your Torn key. Check the key and its faction API Access permission,
          then try again.
        </p>
      )}
      {ffscouterKeyInput && ffscouterValidation === "invalid" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not validate your FFScouter key. Check the key and try again, or leave it blank.
        </p>
      )}
      <Button type="submit" disabled={!publicKeyInput?.trim() || isValidating}>
        {isValidating && <Loader2 className="size-4 animate-spin" />}
        {isValidating ? "Validating…" : "Validate"}
      </Button>
    </form>
  );
}

function KeyHelp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-0.5"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72" sideOffset={6}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
