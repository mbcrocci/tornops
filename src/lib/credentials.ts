// Checks that an API key works by making the cheapest request it allows.

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
