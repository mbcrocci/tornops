import { createFileRoute } from "@tanstack/react-router";
import { WarPlanning } from "@/components/war-planning";

export const Route = createFileRoute("/war-planning")({ component: WarPlanning });
