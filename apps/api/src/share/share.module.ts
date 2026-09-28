import { Module } from "@nestjs/common";
import { ShareController } from "./share.controller.js";

@Module({ controllers: [ShareController] })
export class ShareModule {}
