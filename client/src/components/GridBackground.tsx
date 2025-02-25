export function GridBackground() {
  return (
    <div className="fixed inset-0 z-0">
      <div
        className="w-full h-full bg-[#fafafa]"
        style={{
          backgroundImage: `
          linear-gradient(to right, #e5e5e5 1px, transparent 1px),
          linear-gradient(to bottom, #e5e5e5 1px, transparent 1px)
        `,
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  )
}

