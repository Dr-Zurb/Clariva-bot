export function TabPlaceholder({ name }: { name: string }) {
  return (
    <div className="p-12 text-center text-muted-foreground">
      <p className="text-lg font-medium">{name} tab — coming soon</p>
      <p className="text-sm">Wave 5 lights this up.</p>
    </div>
  );
}
