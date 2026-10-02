import { Module } from "@nestjs/common";
import { PlacesAutocompleteController } from "./places-autocomplete.controller.js";
import { PlacesLiveController } from "./places-live.controller.js";
import { PlacesService } from "./places.service.js";

@Module({
  controllers: [PlacesAutocompleteController, PlacesLiveController],
  providers: [PlacesService],
})
export class PlacesModule {}
