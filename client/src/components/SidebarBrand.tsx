export function SidebarBrand() {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <img src="./noteblock.png" alt="" className="h-5 w-5 shrink-0 rounded-[5px]" />
            {/* Minecraft is a pixel face on an 8px grid, so it only renders crisply at multiples of 8 */}
            <h1
                className="truncate text-[16px] leading-5 text-ink"
                style={{ fontFamily: "Minecraft" }}
            >
                noteblock
            </h1>
        </div>
    );
}
