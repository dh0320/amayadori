import EnterButton from '@/components/EnterButton';

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-bold">Amayadori MVP</h1>
        <EnterButton />
      </div>
    </main>
  );
}
