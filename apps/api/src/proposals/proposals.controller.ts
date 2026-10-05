import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Inject,
} from "@nestjs/common";
import {
  placeProposalCreateSchema,
  spotProposalSchema,
  tacoProposalSchema,
} from "@taco-hunt/contracts";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { ProposalsService } from "./proposals.service.js";

@Controller()
@UseGuards(AuthRequiredGuard)
export class ProposalsController {
  constructor(@Inject(ProposalsService) private readonly proposals: ProposalsService) {}

  @Post("/place-proposals")
  async createPlace(@CurrentProfile() profile: AuthenticatedProfile, @Body() body: unknown) {
    const parsed = placeProposalCreateSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Propuesta inválida",
        details: { issues: parsed.error.issues },
      });
    return this.proposals.createPlace(profile, parsed.data);
  }

  @Post("/spot-proposals")
  async createSpot(@CurrentProfile() profile: AuthenticatedProfile, @Body() body: unknown) {
    const parsed = spotProposalSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Propuesta inválida",
        details: { issues: parsed.error.issues },
      });
    return this.proposals.createSpot(profile, parsed.data);
  }

  @Post("/taco-proposals")
  async createTaco(@CurrentProfile() profile: AuthenticatedProfile, @Body() body: unknown) {
    const parsed = tacoProposalSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Propuesta inválida",
        details: { issues: parsed.error.issues },
      });
    return this.proposals.createTaco(profile, parsed.data);
  }

  @Get("/me/proposals")
  listMine(@CurrentProfile() profile: AuthenticatedProfile) {
    return this.proposals.listMine(profile);
  }
}
