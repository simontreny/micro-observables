import { createPersist, Migration } from "..";
import { observable } from "../../interface";

class MemoryStorage {
  items: { [key: string]: string } = {};

  getItem(key: string): string | undefined {
    return this.items[key];
  }

  setItem(key: string, value: string) {
    this.items[key] = value;
  }

  removeItem(key: string) {
    delete this.items[key];
  }
}

test("Observables are written to the storage", () => {
  const storage = new MemoryStorage();
  const { persist } = createPersist({ storage });

  const book = observable("The Jungle Book");
  persist({ book });
  expect(storage.items).toStrictEqual({});

  book.set("Pride and Prejudice");
  expect(storage.items).toStrictEqual({ book: '"Pride and Prejudice"' });
});

test("Observables are restored from the storage", () => {
  const storage = new MemoryStorage();
  storage.items["book"] = '"Pride and Prejudice"';
  const { persist } = createPersist({ storage });

  const book = observable("The Jungle Book");
  persist({ book });
  expect(book.get()).toStrictEqual("Pride and Prejudice");
});

test("Migrations are applied before observables are loaded", () => {
  const migration1: Migration = ({ set }) => {
    set("book", "Hamlet");
  };
  const migration2: Migration = ({ get, set }) => {
    set("book", get("book") + " Remastered");
  };
  const migration3: Migration = ({ get, set }) => {
    set("book", get("book").toLowerCase());
  };

  const storage = new MemoryStorage();
  storage.items["book"] = '"The Jungle Book"';
  storage.items["micro-observables-persist.version"] = "1";
  const { persist } = createPersist({ storage, migrations: [migration1, migration2, migration3] });

  const book = observable("Hamlet");
  persist({ book });
  expect(book.get()).toStrictEqual("the jungle book remastered");
  expect(storage.items["micro-observables-persist.version"]).toStrictEqual("3");
});

test("Observables are not written to the storage when readOnly", () => {
  const storage = new MemoryStorage();
  storage.items["book"] = '"The Jungle Book"';
  const { persist } = createPersist({ storage, readOnly: true });

  const book = observable("Hamlet");
  persist({ book });
  expect(book.get()).toStrictEqual("The Jungle Book");

  book.set("Pride and Prejudice");
  expect(book.get()).toStrictEqual("Pride and Prejudice");
  expect(storage.items).toStrictEqual({ book: '"The Jungle Book"' });

  const book2 = observable("Hamlet");
  persist({ book: book2 });
  expect(book2.get()).toStrictEqual("Pride and Prejudice");
});
