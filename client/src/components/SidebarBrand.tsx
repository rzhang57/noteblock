export function SidebarBrand() {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <img src="./noteblock.png" alt="" className="h-5 w-5 shrink-0 rounded-[5px]" />
            <h1
                className="truncate text-[13px] leading-none tracking-tight text-ink"
                style={{ fontFamily: "Minecraft" }}
            >
                noteblock
            </h1>
        </div>
    );
}
