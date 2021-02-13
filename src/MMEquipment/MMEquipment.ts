import { IPlugin, IModLoaderAPI, ModLoaderEvents } from 'modloader64_api/IModLoaderAPI';
// import { Heap } from 'modloader64_api/heap';
import { bus, EventHandler } from 'modloader64_api/EventHandler';
import { IOOTCore, OotEvents, Age } from 'modloader64_api/OOT/OOTAPI';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { Z64OnlineEvents, Z64Online_EquipmentPak } from './Z64API/OotoAPI';
import { onViUpdate } from 'modloader64_api/PluginLifecycle';
import { resolve } from 'path';
import { readFileSync, writeJSONSync, readJSONSync, existsSync } from 'fs-extra';
import { EquipmentHelper } from './EquipmentHelper';

const configFileName: string = "./mm_equipment_paks.json";

interface IEquipment_Config {
    adult_equipment: string[],
    child_equipment: string[],
    // replace_gi_models: boolean,
    // replace_textures: boolean
}

const enum Manifest {
    KOKIRI_SWORD = "kokiri_sword.bin",
    MASTER_SWORD = "master_sword.bin",
    BIGGORON_SWORD = "biggoron_sword.bin",
    HYLIAN_SHIELD_CHILD = "hylian_shield_child.bin",
    HYLIAN_SHIELD_ADULT = "hylian_shield_adult.bin",
    HYLIAN_SHIELD_ADULT_RESCALED = "hylian_shield_adult_rescaled.bin",
    BOTTLE_CHILD = "bottle_child.bin",
    BOTTLE_ADULT = "bottle_adult.bin",
    DEKU_SHIELD = "deku_shield.bin",
    MIRROR_SHIELD = "mirror_shield.bin",
    MIRROR_SHIELD_RESCALED = "mirror_shield_rescaled.bin",
    DEKU_STICK = "deku_stick.bin",
    BOW = "bow.bin",
    SLINGSHOT = "slingshot.bin",
    HOOKSHOT = "hookshot.bin",
    FPS_HAND_CHILD = "fps_hand_child.bin"
}

const enum Category {
    KOKIRI_SWORD = "Kokiri Sword",
    MASTER_SWORD = "Master Sword",
    BIGGORON_SWORD = "Biggoron's Sword",
    DEKU_SHIELD = "Deku Shield",
    HYLIAN_SHIELD = "Hylian Shield",
    MIRROR_SHIELD = "Mirror Shield",
    C_ITEMS = "Items"
}

class EnvColorDLC {
    private command: Buffer = Buffer.from([0xFB, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF]);

    public writeRGB(r: number, g: number, b: number) {
        this.command[4] = r;
        this.command[5] = g;
        this.command[6] = b;
    }

    public getCommand(): Buffer { return this.command; }

    public getRGB(): Buffer { return this.command.slice(4, 7); }
}

class EquipmentPakExtended extends Z64Online_EquipmentPak {

    offsets: number[];
    category!: string;
    age!: Age;

    constructor(name: string, data: Buffer, envCommandOffsets: number[], category: string, age: Age) {
        super(name, data);
        this.offsets = envCommandOffsets;
        this.category = category;
        this.age = age;
    }
}

class MMEquipment implements IPlugin {
    categoryArraysAdult: Map<Category, Array<EquipmentPakExtended>> = new Map<Category, Array<EquipmentPakExtended>>();
    categoryArraysChild: Map<Category, Array<EquipmentPakExtended>> = new Map<Category, Array<EquipmentPakExtended>>();

    checkboxesChild: Map<EquipmentPakExtended, boolean> = new Map<EquipmentPakExtended, boolean>();
    checkboxesAdult: Map<EquipmentPakExtended, boolean> = new Map<EquipmentPakExtended, boolean>();

    envColorCommand: EnvColorDLC = new EnvColorDLC();

    tunicNeedsFix: boolean = false;

    storedTunicColor!: number;

    isAdult!: boolean;

    shouldUpdateOnAgeChange: boolean = false;
    loadConfigOnAgeChange: boolean = false;

    /* track what the player currently has equipped */
    currentlyEquippedAdult: EquipmentPakExtended[] = new Array();
    currentlyEquippedChild: EquipmentPakExtended[] = new Array();

    /* ImGui stuff */
    windowOpen: boolean[] = [false];

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;
    @InjectCore()
    core!: IOOTCore;

    preinit(): void {
    }

    init(): void {
        this.categoryArraysAdult.set(Category.MASTER_SWORD, new Array<EquipmentPakExtended>());
        this.categoryArraysAdult.set(Category.BIGGORON_SWORD, new Array<EquipmentPakExtended>());
        this.categoryArraysAdult.set(Category.HYLIAN_SHIELD, new Array<EquipmentPakExtended>());
        this.categoryArraysAdult.set(Category.MIRROR_SHIELD, new Array<EquipmentPakExtended>());
        this.categoryArraysAdult.set(Category.C_ITEMS, new Array<EquipmentPakExtended>());

        this.categoryArraysChild.set(Category.KOKIRI_SWORD, new Array<EquipmentPakExtended>());
        this.categoryArraysChild.set(Category.DEKU_SHIELD, new Array<EquipmentPakExtended>());
        this.categoryArraysChild.set(Category.HYLIAN_SHIELD, new Array<EquipmentPakExtended>());
        this.categoryArraysChild.set(Category.C_ITEMS, new Array<EquipmentPakExtended>());

        /* Setting up Kokiri Sword options... */
        this.zobjToEquipPak("kokiri_sword_mm.zobj", Manifest.KOKIRI_SWORD, "Kokiri Sword", Category.KOKIRI_SWORD, Age.CHILD);
        this.zobjToEquipPak("razor_sword.zobj", Manifest.KOKIRI_SWORD, "Razor Sword", Category.KOKIRI_SWORD, Age.CHILD);
        this.zobjToEquipPak("gilded_sword.zobj", Manifest.KOKIRI_SWORD, "Gilded Sword", Category.KOKIRI_SWORD, Age.CHILD);

        /* Master Sword options... */
        this.zobjToEquipPak("kokiri_sword_mm.zobj", Manifest.MASTER_SWORD, "Kokiri Sword", Category.MASTER_SWORD, Age.ADULT);
        this.zobjToEquipPak("razor_sword.zobj", Manifest.MASTER_SWORD, "Razor Sword", Category.MASTER_SWORD, Age.ADULT);
        this.zobjToEquipPak("gilded_sword.zobj", Manifest.MASTER_SWORD, "Gilded Sword", Category.MASTER_SWORD, Age.ADULT);

        /* Biggoron's Sword */
        this.zobjToEquipPak("fierce_deity_sword.zobj", Manifest.BIGGORON_SWORD, "Fierce Deity Sword", Category.BIGGORON_SWORD, Age.ADULT);
        this.zobjToEquipPak("great_fairy_sword.zobj", Manifest.BIGGORON_SWORD, "Great Fairy Sword", Category.BIGGORON_SWORD, Age.ADULT);

        /* Now for Deku Shield options... */
        this.zobjToEquipPak("hero_shield.zobj", Manifest.DEKU_SHIELD, "Hero's Shield", Category.DEKU_SHIELD, Age.CHILD);
        this.zobjToEquipPak("mirror_shield_mm.zobj", Manifest.DEKU_SHIELD, "Mirror Shield", Category.DEKU_SHIELD, Age.CHILD);

        /* Hylian Shield */
        this.zobjToEquipPak("hero_shield.zobj", Manifest.HYLIAN_SHIELD_CHILD, "Hero's Shield", Category.HYLIAN_SHIELD, Age.CHILD);
        this.zobjToEquipPak("mirror_shield_mm.zobj", Manifest.HYLIAN_SHIELD_CHILD, "Mirror Shield", Category.HYLIAN_SHIELD, Age.CHILD);
        this.zobjToEquipPak("hero_shield.zobj", Manifest.HYLIAN_SHIELD_ADULT, "Hero's Shield", Category.HYLIAN_SHIELD, Age.ADULT);
        this.zobjToEquipPak("hero_shield.zobj", Manifest.HYLIAN_SHIELD_ADULT_RESCALED, "Hero's Shield (Adult)", Category.HYLIAN_SHIELD, Age.ADULT);
        this.zobjToEquipPak("mirror_shield_mm.zobj", Manifest.HYLIAN_SHIELD_ADULT, "Mirror Shield", Category.HYLIAN_SHIELD, Age.ADULT);
        this.zobjToEquipPak("mirror_shield_mm.zobj", Manifest.HYLIAN_SHIELD_ADULT_RESCALED, "Mirror Shield (Adult)", Category.HYLIAN_SHIELD, Age.ADULT);

        /* Mirror Shield */
        this.zobjToEquipPak("hero_shield.zobj", Manifest.MIRROR_SHIELD, "Hero's Shield", Category.MIRROR_SHIELD, Age.ADULT);
        this.zobjToEquipPak("hero_shield.zobj", Manifest.MIRROR_SHIELD_RESCALED, "Hero's Shield (Adult)", Category.MIRROR_SHIELD, Age.ADULT);
        this.zobjToEquipPak("mirror_shield_mm.zobj", Manifest.MIRROR_SHIELD, "Mirror Shield", Category.MIRROR_SHIELD, Age.ADULT);
        this.zobjToEquipPak("mirror_shield_mm.zobj", Manifest.MIRROR_SHIELD_RESCALED, "Mirror Shield (Adult)", Category.MIRROR_SHIELD, Age.ADULT);

        /* Bottle */
        this.zobjToEquipPak("bottle_mm.zobj", Manifest.BOTTLE_CHILD, "Bottle", Category.C_ITEMS, Age.CHILD);
        this.zobjToEquipPak("bottle_mm.zobj", Manifest.BOTTLE_ADULT, "Bottle", Category.C_ITEMS, Age.ADULT);

        /* Deku Stick */
        this.zobjToEquipPak("stick_mm.zobj", Manifest.DEKU_STICK, "Deku Stick", Category.C_ITEMS, Age.CHILD);

        /* Slingshot + Bow */
        // this.zobjToEquipPak("hero_bow.zobj", Manifest.SLINGSHOT, "Hero's Bow", Category.C_ITEMS, Age.CHILD);
        this.zobjToEquipPak("hero_bow.zobj", Manifest.BOW, "Hero's Bow", Category.C_ITEMS, Age.ADULT);

        /* Hookshot */
        // this.zobjToEquipPak("hookshot_mm.zobj", Manifest.HOOKSHOT, "Hookshot", Category.C_ITEMS, Age.ADULT);

        /* Experimental */
        // this.zobjToEquipPak("mm_fps_arm.zobj", Manifest.FPS_HAND_CHILD, "FPS Right Arm", Category.C_ITEMS, Age.CHILD);

        if (existsSync(configFileName)) {
            try {
                let cfg: IEquipment_Config = readJSONSync(configFileName);

                this.categoryArraysAdult.forEach((arrays: EquipmentPakExtended[], cat: Category) => {
                    arrays.forEach((pak: EquipmentPakExtended) => {
                        cfg.adult_equipment.forEach((name: string) => {
                            if (name === pak.name) {
                                this.currentlyEquippedAdult.push(pak);
                                this.checkboxesAdult.set(pak, true);
                            }
                        });
                    });
                });

                this.categoryArraysChild.forEach((arrays: EquipmentPakExtended[], cat: Category) => {
                    arrays.forEach((pak: EquipmentPakExtended) => {
                        cfg.child_equipment.forEach((name: string) => {
                            if (name === pak.name) {
                                this.currentlyEquippedChild.push(pak);
                                this.checkboxesChild.set(pak, true);
                            }
                        });
                    });
                });

                this.ModLoader.logger.info("Successfully loaded saved MM Equipment");
                this.loadConfigOnAgeChange = true;
            } catch (error) {
                this.ModLoader.logger.error("Error applying saved equipment!");
            }
        }
    }

    postinit(): void {
    }
    onTick(frame?: number | undefined): void {
        if (this.core.helper.isPaused())
            return;

        let addr: number = 0x000f7ad8 + this.core.link.tunic * 3;
        let currColor: number = (this.ModLoader.emulator.rdramRead16(addr) << 8) | (this.ModLoader.emulator.rdramRead8(addr + 2));

        if (this.storedTunicColor !== currColor) {
            this.storedTunicColor = currColor;
            this.updateEnvColor();
            this.tunicNeedsFix = true;

            let currentEquipped: EquipmentPakExtended[];

            if (this.isAdult) {
                currentEquipped = this.currentlyEquippedAdult;
            } else {
                currentEquipped = this.currentlyEquippedChild;
            }

            currentEquipped.forEach(pak => {
                this.fixPakEnvColor(pak);
                this.ModLoader.utils.setTimeoutFrames(() => {
                    bus.emit(Z64OnlineEvents.LOAD_EQUIPMENT_BUFFER, new Z64Online_EquipmentPak(pak.name, pak.data));
                }, 1)
            });

            this.ModLoader.utils.setTimeoutFrames(() => {
                bus.emit(Z64OnlineEvents.REFRESH_EQUIPMENT);
            }, 1);
        }
    }

    @EventHandler(ModLoaderEvents.ON_SOFT_RESET_POST)
    onSoftResetPost() { }

    @EventHandler(OotEvents.ON_SAVE_LOADED)
    onSaveLoad() {
        this.isAdult = (this.core.save.age === Age.ADULT);
        this.updateEnvColor();
        if (this.isAdult) {
            if (this.currentlyEquippedAdult.length !== 0) {
                this.currentlyEquippedAdult.forEach((pak) => {
                    this.fixPakEnvColor(pak);
                    this.ModLoader.utils.setTimeoutFrames(() => {
                        bus.emit(Z64OnlineEvents.LOAD_EQUIPMENT_BUFFER, pak);
                    }, 1)
                });
                this.ModLoader.utils.setTimeoutFrames(() => {
                    bus.emit(Z64OnlineEvents.REFRESH_EQUIPMENT, {});
                }, 1);
            }
        }
        else if (this.currentlyEquippedChild.length !== 0) {
            this.currentlyEquippedChild.forEach((pak) => {
                this.fixPakEnvColor(pak);
                this.ModLoader.utils.setTimeoutFrames(() => {
                    bus.emit(Z64OnlineEvents.LOAD_EQUIPMENT_BUFFER, pak);
                }, 1)
            });
            this.ModLoader.utils.setTimeoutFrames(() => {
                bus.emit(Z64OnlineEvents.REFRESH_EQUIPMENT, {});
            }, 1);
        }

        this.shouldUpdateOnAgeChange = true;
    }

    @EventHandler(OotEvents.ON_AGE_CHANGE)
    onAgeChange(age: Age): void {
        this.isAdult = (age === Age.ADULT);

        if (this.shouldUpdateOnAgeChange) {
            let currentEquip: EquipmentPakExtended[];

            if (this.isAdult) {
                currentEquip = this.currentlyEquippedAdult;
            } else currentEquip = this.currentlyEquippedChild;

            this.updateEnvColor();

            currentEquip.forEach(pak => {
                this.fixPakEnvColor(pak);
            });

            if(this.loadConfigOnAgeChange) {
                currentEquip.forEach((pak) => {
                    this.ModLoader.utils.setTimeoutFrames(() => {
                        bus.emit(Z64OnlineEvents.LOAD_EQUIPMENT_BUFFER, pak);
                    }, 1)
                });
                this.loadConfigOnAgeChange = false;
            }

            this.ModLoader.utils.setTimeoutFrames(() => {
                bus.emit(Z64OnlineEvents.REFRESH_EQUIPMENT, {})
            }, 1);

        }
    }

    updateEnvColor(): void {
        let addr: number = 0x000f7ad8 + this.core.link.tunic * 3;
        let color: Buffer = this.ModLoader.emulator.rdramReadBuffer(addr, 0x3);
        this.envColorCommand.writeRGB(color[0], color[1], color[2]);
    }

    fixPakEnvColor(pak: EquipmentPakExtended): void {
        pak.offsets.forEach(offset => {
            this.envColorCommand.getCommand().copy(pak.data, offset);
        });
    }

    updateConfig(): void {
        this.ModLoader.utils.setTimeoutFrames(() => {
            try {
                let cfg: IEquipment_Config = {
                    adult_equipment: new Array(),
                    child_equipment: new Array(),
                    // replace_gi_models: false,
                    // replace_textures: false
                }

                this.currentlyEquippedAdult.forEach((element: EquipmentPakExtended) => {
                    cfg.adult_equipment.push(element.name);
                });
                this.currentlyEquippedChild.forEach((element: EquipmentPakExtended) => {
                    cfg.child_equipment.push(element.name);
                });

                writeJSONSync(configFileName, cfg);
            } catch (error) {
                this.ModLoader.logger.error("Error saving MM Equipment settings!");
                this.ModLoader.logger.error(error.message);
            }
        }, 1);
    }

    @onViUpdate()
    onViUpdate() {
        if (this.ModLoader.ImGui.beginMainMenuBar()) {
            if (this.ModLoader.ImGui.beginMenu("Mods")) {
                if (this.ModLoader.ImGui.menuItem("MM Equipment")) {
                    this.windowOpen[0] = true;
                }

                this.ModLoader.ImGui.endMenu();
            }
            this.ModLoader.ImGui.endMainMenuBar();
        }

        if (this.windowOpen[0]) {
            if (this.ModLoader.ImGui.begin("Majora's Mask Equipment Config", this.windowOpen)) {
                if (this.ModLoader.ImGui.button("Remove Equipment")) {
                    this.clearEquipment();
                }

                if (this.ModLoader.ImGui.treeNode("Adult###MMEquipAdult")) {
                    this.categoryArraysAdult.forEach((paks: EquipmentPakExtended[], category: Category) => {
                        if (this.ModLoader.ImGui.treeNode(category + "###MMEquipmentCatsAdult" + category)) {
                            for (let i: number = 0; i < paks.length; i++) {
                                if (this.ModLoader.ImGui.menuItem(paks[i].name,
                                    undefined, this.checkboxesAdult.get(paks[i]))) {
                                    if (this.isAdult) {
                                        this.fixPakEnvColor(paks[i]);
                                        this.checkboxesAdult.set(paks[i], true);
                                        this.ModLoader.utils.setTimeoutFrames(() => {
                                            bus.emit(Z64OnlineEvents.LOAD_EQUIPMENT_BUFFER, new Z64Online_EquipmentPak(paks[i].name, paks[i].data));
                                            bus.emit(Z64OnlineEvents.REFRESH_EQUIPMENT, {});
                                        }, 1)
                                        this.currentlyEquippedAdult.push(paks[i]);
                                        this.updateConfig();
                                    }
                                }
                            }
                            this.ModLoader.ImGui.treePop();
                        }
                    });
                    this.ModLoader.ImGui.treePop();
                }

                if (this.ModLoader.ImGui.treeNode("Child###MMEquipChild")) {
                    this.categoryArraysChild.forEach((paks: EquipmentPakExtended[], category: Category) => {
                        if (this.ModLoader.ImGui.treeNode(category + "###MMEquipmentCatsChild" + category)) {
                            for (let i: number = 0; i < paks.length; i++) {
                                if (this.ModLoader.ImGui.menuItem(paks[i].name,
                                    undefined, this.checkboxesChild.get(paks[i]))) {
                                    if (!this.isAdult) {
                                        this.fixPakEnvColor(paks[i]);
                                        this.checkboxesChild.set(paks[i], true);
                                        this.ModLoader.utils.setTimeoutFrames(() => {
                                            bus.emit(Z64OnlineEvents.LOAD_EQUIPMENT_BUFFER, new Z64Online_EquipmentPak(paks[i].name, paks[i].data));
                                            bus.emit(Z64OnlineEvents.REFRESH_EQUIPMENT, {});
                                        }, 1)
                                        this.currentlyEquippedChild.push(paks[i]);
                                        this.updateConfig();
                                    }
                                }
                            }
                            this.ModLoader.ImGui.treePop();
                        }
                    });
                    this.ModLoader.ImGui.treePop();
                }
                this.ModLoader.ImGui.end();
            }
        }
    }

    clearEquipment(): void {
        this.ModLoader.utils.setTimeoutFrames(() => {
            bus.emit(Z64OnlineEvents.CLEAR_EQUIPMENT, {});
            bus.emit(Z64OnlineEvents.REFRESH_EQUIPMENT, {});
        }, 1)
    }

    @EventHandler(Z64OnlineEvents.CLEAR_EQUIPMENT)
    resetMMEquipment(): void {
        if (this.isAdult) {
            this.checkboxesAdult.forEach((val: boolean, key: EquipmentPakExtended) => {
                this.checkboxesAdult.set(key, false);
                this.currentlyEquippedAdult.length = 0;
            });
            this.currentlyEquippedAdult.length = 0;
        } else {
            this.checkboxesChild.forEach((val: boolean, key: EquipmentPakExtended) => {
                this.checkboxesChild.set(key, false);
            });
            this.currentlyEquippedChild.length = 0;
        }
        this.updateConfig();
    }

    zobjToEquipPak(zobj: string, manifest: string, name: string, category: Category, age: Age): void {
        let buf: Buffer = readFileInDir("zobj/" + zobj);

        buf = Buffer.concat([buf, readFileInDir("manifests/" + manifest)]);

        let indeces: number[] = findAllOcurrencesInBuf("FIXTUNIC", buf);

        EquipmentHelper.setEquipmentCategory(buf, category);

        let pak: EquipmentPakExtended = new EquipmentPakExtended(name + "###" + age.toString() + name + category, buf, indeces, category, age);

        if (age === Age.ADULT) {
            if (this.categoryArraysAdult.get(category)) {
                this.categoryArraysAdult.get(category).push(pak);
            }
            this.checkboxesAdult.set(pak, false);
        } else {
            if (this.categoryArraysChild.get(category)) {
                this.categoryArraysChild.get(category).push(pak);
            }
            this.checkboxesChild.set(pak, false);
        }
    }
}

function readFileInDir(file: string): Buffer {
    return readFileSync(resolve(__dirname, file));
}

function findAllOcurrencesInBuf(substr: string, buf: Buffer): number[] {
    let indeces: number[] = new Array();
    let i: number;
    let start: number = 0;

    do {
        i = buf.indexOf(substr, start)

        if (i >= 0) {
            indeces.push(i);
            start = i + substr.length;
        }
    } while (i != -1);

    return indeces;
}



module.exports = MMEquipment;
