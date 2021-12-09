import { batch, derived, fromPromise, observable, toPromise } from "../src/interface";

test("Observable.get() should return initial value", () => {
  const book = observable("The Jungle Book");
  expect(book.get()).toBe("The Jungle Book");
});

test("Observable.set() should change observable's value", () => {
  const book = observable("The Jungle Book");
  book.set("Pride and Prejudice");
  expect(book.get()).toBe("Pride and Prejudice");
});

test("Observable.update() should change observable's value, using current value", () => {
  const books = observable(["The Jungle Book"]);
  books.update((it) => [...it, "Pride and Prejudice"]);
  expect(books.get()).toStrictEqual(["The Jungle Book", "Pride and Prejudice"]);
});

test("Listeners added with Observable.subscribe() should be called when value changes", () => {
  const book = observable("The Jungle Book");

  const received: string[] = [];
  const prevReceived: string[] = [];
  book.subscribe((newBook, prevBook) => {
    received.push(newBook);
    prevReceived.push(prevBook);
  });
  expect(received).toStrictEqual([]);
  expect(prevReceived).toStrictEqual([]);

  book.set("Pride and Prejudice");
  expect(received).toStrictEqual(["Pride and Prejudice"]);
  expect(prevReceived).toStrictEqual(["The Jungle Book"]);
});

test("Listeners added with Observable.subscribe() should be removed when calling returned function", () => {
  const book = observable("The Jungle Book");

  const received: string[] = [];
  const addBookToReceived = (newBook: string) => received.push(newBook);
  const unsubscribe1 = book.subscribe(addBookToReceived);
  const unsubscribe2 = book.subscribe(addBookToReceived);
  expect(received).toStrictEqual([]);

  book.set("Pride and Prejudice");
  expect(received).toStrictEqual(["Pride and Prejudice", "Pride and Prejudice"]);

  unsubscribe1();
  book.set("Hamlet");
  expect(received).toStrictEqual(["Pride and Prejudice", "Pride and Prejudice", "Hamlet"]);

  unsubscribe1();
  book.set("Romeo and Juliet");
  expect(received).toStrictEqual(["Pride and Prejudice", "Pride and Prejudice", "Hamlet", "Romeo and Juliet"]);

  unsubscribe2();
  book.set("Macbeth");
  expect(received).toStrictEqual(["Pride and Prejudice", "Pride and Prejudice", "Hamlet", "Romeo and Juliet"]);
});

test("Listeners can be removed as soon as they are invoked without preventing other listeners to be invoked", () => {
  const book = observable("The Jungle Book");

  const received: string[] = [];
  const addBookToReceived = (newBook: string) => received.push(newBook);
  const unsubscribe1 = book.subscribe((newBook) => {
    addBookToReceived(newBook);
    unsubscribe1();
  });
  const unsubscribe2 = book.subscribe(addBookToReceived);
  expect(received).toStrictEqual([]);

  book.set("Pride and Prejudice");
  expect(received).toStrictEqual(["Pride and Prejudice", "Pride and Prejudice"]);

  book.set("Hamlet");
  expect(received).toStrictEqual(["Pride and Prejudice", "Pride and Prejudice", "Hamlet"]);

  unsubscribe2();
  book.set("Romeo and Juliet");
  expect(received).toStrictEqual(["Pride and Prejudice", "Pride and Prejudice", "Hamlet"]);
});

test("derived() should create a new observable with the result of the computation", () => {
  const book = observable({ title: "The Jungle Book", author: "Kipling" });
  const author = derived(() => book.get().author);
  expect(author.get()).toBe("Kipling");

  const received: string[] = [];
  author.subscribe((newAuthor) => received.push(newAuthor));

  book.set({ title: "Pride and Prejudice", author: "Austen" });
  expect(author.get()).toBe("Austen");
  expect(received).toStrictEqual(["Austen"]);

  book.set({ title: "Hamlet", author: "Shakespeare" });
  expect(author.get()).toBe("Shakespeare");
  expect(received).toStrictEqual(["Austen", "Shakespeare"]);
});

test("derived() should automatically tracks inputs and be updated when an input is modified", () => {
  const title = observable("Hamlet");
  const author = observable("Shakespeare");
  const book = derived(() => ({ title: title.get(), author: author.get() }));
  expect(book.get()).toStrictEqual({ author: "Shakespeare", title: "Hamlet" });

  const received: { title: string; author: string }[] = [];
  book.subscribe((b) => received.push(b));
  title.set("Romeo and Juliet");
  expect(received).toStrictEqual([{ author: "Shakespeare", title: "Romeo and Juliet" }]);

  batch(() => {
    title.set("Pride and Prejudice");
    author.set("Austen");
  });
  expect(received).toStrictEqual([
    { author: "Shakespeare", title: "Romeo and Juliet" },
    { author: "Austen", title: "Pride and Prejudice" },
  ]);

  const bookTitleLength = derived(() => book.get().title.length);
  expect(bookTitleLength.get()).toStrictEqual(19);

  const receivedLength: number[] = [];
  bookTitleLength.subscribe((l) => receivedLength.push(l));
  title.set("Prejudice and Pride");
  expect(receivedLength).toStrictEqual([]);

  title.set("Persuasion");
  expect(receivedLength).toStrictEqual([10]);
});

test("fromPromise() should create a new observable initialized with undefined and changed when the promise is resolved", async () => {
  const bookPromise = Promise.resolve("The Jungle Book");
  const book = fromPromise(bookPromise);
  expect(book.get()).toStrictEqual(undefined);

  await expect(bookPromise).resolves;
  expect(book.get()).toStrictEqual("The Jungle Book");

  const failedBookPromise = Promise.reject("timeout");
  const failedBook = fromPromise(failedBookPromise, (e) => `Failed to fetch book: ${e}`);
  expect(failedBook.get()).toStrictEqual(undefined);

  await expect(failedBookPromise).rejects;
  expect(failedBook.get()).toStrictEqual("Failed to fetch book: timeout");
});

test("Observable.toPromise() should create a promise that is resolved the next time the observable's value changes", async () => {
  const book = observable("The Jungle Book");
  const bookPromise = toPromise(book);
  book.set("Pride and Prejudice");
  await expect(bookPromise).resolves.toStrictEqual("Pride and Prejudice");
});

test("Computed observables should call listeners as few as possible", () => {
  const books = observable(["The Jungle Book", "Pride and Prejudice"]);
  const book1 = derived(() => books.get()[0]);
  const book2 = derived(() => books.get()[1]);
  const newBooks = derived(() => [book1.get(), book2.get()]);
  expect(newBooks.get()).toStrictEqual(books.get());

  books.set(["Romeo and Juliet", "Hamlet"]);
  expect(newBooks.get()).toStrictEqual(books.get());

  const received: string[][] = [];
  newBooks.subscribe((b) => received.push(b));
  books.set(["The Jungle Book", "Pride and Prejudice"]);
  expect(received).toStrictEqual([["The Jungle Book", "Pride and Prejudice"]]);
});

test("Observable.batch() calls listeners of modified observables only once", () => {
  const numbers = Array.from(Array(10).keys()).map((index) => observable(index));
  const total = derived(() => numbers.reduce((acc, num) => acc + num.get(), 0));
  expect(total.get()).toStrictEqual(45);

  let received: number[] = [];
  total.subscribe((t) => received.push(t));
  numbers.forEach((num) => num.update((it) => it + 1));
  expect(received).toStrictEqual([46, 47, 48, 49, 50, 51, 52, 53, 54, 55]);

  received = [];
  batch(() => numbers.forEach((num) => num.update((it) => it + 1)));
  expect(received).toStrictEqual([65]);
});
