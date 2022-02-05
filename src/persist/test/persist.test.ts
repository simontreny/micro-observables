import { createPersist, Migration } from "..";
import { observable } from "../../interface";

class MemoryStorage {
  items: { [key: string]: string } = {};

  async getItem(key: string): Promise<string | undefined> {
    return this.items[key];
  }

  async setItem(key: string, value: string): Promise<void> {
    this.items[key] = value;
  }

  async removeItem(key: string): Promise<void> {
    delete this.items[key];
  }
}

test("Observables are written to the storage", async () => {
  const storage = new MemoryStorage();
  const { persist, waitForReady, flush } = createPersist({ storage });

  const book = observable("The Jungle Book");
  persist({ book });
  await waitForReady();
  expect(storage.items).toStrictEqual({});

  book.set("Pride and Prejudice");
  await flush();
  expect(storage.items).toStrictEqual({ book: '"Pride and Prejudice"' });
});

test("Observables are restored from the storage", async () => {
  const storage = new MemoryStorage();
  storage.items["book"] = '"Pride and Prejudice"';
  const { persist, waitForReady } = createPersist({ storage });

  const book = observable("The Jungle Book");
  persist({ book });
  await waitForReady();
  expect(book.get()).toStrictEqual("Pride and Prejudice");
});

test("Migrations are applied before observables are loaded", async () => {
  const migration1: Migration = async ({ set }) => {
    await set("book", "Hamlet");
  };
  const migration2: Migration = async ({ get, set }) => {
    await set("book", (await get("book")) + " Remastered");
  };
  const migration3: Migration = async ({ get, set }) => {
    await set("book", (await get("book")).toLowerCase());
  };

  const storage = new MemoryStorage();
  storage.items["book"] = '"The Jungle Book"';
  storage.items["mo-persist.version"] = "1";
  const { persist, waitForReady } = createPersist({ storage, migrations: [migration1, migration2, migration3] });

  const book = observable("Hamlet");
  persist({ book });
  await waitForReady();
  expect(book.get()).toStrictEqual("the jungle book remastered");
  expect(storage.items["mo-persist.version"]).toStrictEqual("3");
});

test("Observables are not written to the storage when readOnly", async () => {
  const storage = new MemoryStorage();
  storage.items["book"] = '"The Jungle Book"';
  const { persist, waitForReady, flush } = createPersist({ storage, readOnly: true });

  const book = observable("Hamlet");
  persist({ book });
  await waitForReady();
  expect(book.get()).toStrictEqual("The Jungle Book");

  book.set("Pride and Prejudice");
  await flush();
  expect(book.get()).toStrictEqual("Pride and Prejudice");
  expect(storage.items).toStrictEqual({ book: '"The Jungle Book"' });
});
