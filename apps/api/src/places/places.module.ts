import { Module } from "@nestjs/common";
import { PlacesController } from "./places.controller.js";
import { PlacesAutocompleteController } from "./places-autocomplete.controller.js";
import { PlacesLiveController } from "./places-live.controller.js";
import { PlacesService } from "./places.service.js";

@Module({
  controllers: [PlacesController, PlacesAutocompleteController, PlacesLiveController],
  providers: [PlacesService],
})
export class PlacesModule {}
