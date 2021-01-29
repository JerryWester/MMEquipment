export class EquipmentHelper {
    public static getEquipmentName(equipment: Buffer): string {
        return this.getHeaderVal(equipment, "EQUIPMENTNAME");
    }

    public static setEquipmentName(equipment: Buffer, name: string): void {
        this.setHeaderVal(equipment, "EQUIPMENTNAME", name);
    }

    public static getEquipmentCategory(equipment: Buffer): string {
        return this.getHeaderVal(equipment, "EQUIPMENTCAT");
    }

    public static setEquipmentCategory(equipment: Buffer, category: string) {
        this.setHeaderVal(equipment, "EQUIPMENTCAT", category);
    }

    private static getHeaderVal(equipment: Buffer, header: string): string {
        let index: number = equipment.indexOf(header);
        if (index === -1 || index + 0x20 < equipment.length) {
            return "";
        }

        return equipment.slice(index + 0x10, index + 0x20).toString().trim();
    }
    
    private static setHeaderVal(equipment: Buffer, header: string, val: string): void {
        let index: number = equipment.indexOf(header);
        if (index === -1 || index + 0x20 < equipment.length) {
            return;
        }

        equipment.fill(0, index + 0x10, index + 0x20);

        if(val.length > 0x10) {
            val = val.substr(0, 0x10);
        }

        Buffer.from(val).copy(equipment, index + 0x10);
    }
}