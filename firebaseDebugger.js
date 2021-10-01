/*
A little util to make it easy to navigate and manipulate Firebase.
Intended to be attached to `window` for debugging purposes.

```
firebase.initializeApp();
window.fb = new FirebaseDebugger(firebase)

fb.upsert('/path', { items: [] }); { "items": [], "$id": "abc123" }
fb.getData('/path/items'); // []

fb.add('/path/items', { name: 'item A' })

fb.upsert('/path/items/42', { name: 'item A updated });
fb.upsert('/path/items/43', { name: 'item B' });

fb.update('/path/items/43', { name: 'item B updated' });
fb.update('/path/items/44', { name: 'item C' }); // Error, because 'update' only works on existing items

fb.delete('/path/items/42');
fb.delete('/path/items'); // Removes all items
```
*/

function toData(doc) {
  const data = doc.data();
  if (typeof data === 'object' && data) {
    return {
      ...data,
      $id: doc.id,
    };
  }
  return data;
}

function isCollection(input) {
  if (isSnap(input)) {
    return Boolean(input.forEach);
  } else if (isRef(input)) {
    return Boolean(input.orderBy);
  }
  throw new Error(`This isn't a ref or a snapshot: ${input}`);
}

function isRef(input) {
  return Boolean(input.path);
}

function isSnap(input) {
  return Boolean(input.metadata);
}

export default class FirebaseDebugger {
  constructor(firebase) {
    this.firebase = firebase;
    this.firestore = firebase.firestore();
    this.data = null;
    this.ref = null;
    this.snap = null;
  }

  async getData(input, quiet = false) {
    const snap = await this.getSnap(input);

    let data;
    if (isCollection(snap)) {
      data = [];
      snap.forEach(doc => data.push(toData(doc)));
    } else {
      const doc = snap;
      data = toData(doc);
    }

    if (!quiet) {
      console.log(JSON.stringify(data, null, '\t'));
    }

    this.data = data;
    return data;
  }

  async getRef(input) {
    let ref = input;

    if (isSnap(input)) {
      ref = input.ref;
    } else if (typeof input === 'string') {
      try {
        ref = this.firestore.doc(input);
        await ref.get();
      } catch (error) {
        if (error.name === 'FirebaseError') {
          ref = this.firestore.collection(input);
        } else {
          throw error;
        }
      }
    }

    this.ref = ref;
    return ref;
  }

  async getSnap(input) {
    let snap = input;

    if (!isSnap(input)) {
      let ref;
      if (isRef(input)) {
        ref = input;
      } else if (typeof input === 'string') {
        ref = await this.getRef(input);
      }
      snap = await ref.get();
    }

    this.snap = snap;
    return snap;
  }

  async add(path, data) {
    const ref = await this.getRef(path);

    if (!isCollection(ref)) {
      throw new Error('Can only add to a collection.');
    }

    const docRef = await ref.add(data);
    return this.getData(docRef);
  }

  async delete(path) {
    const ref = await this.getRef(path);

    if (isCollection(ref)) {
      const snap = await this.getSnap(path);
      const deletions = [];
      snap.forEach(doc => deletions.push(doc.ref.delete()));
      await Promise.all(deletions);
    } else {
      ref.delete();
    }

    return this.getData(ref);
  }

  async upsert(path, data) {
    const ref = await this.getRef(path);

    if (isCollection(ref)) {
      throw new Error("Can't use .upsert on a collection; specify an ID");
    }

    await ref.set(data);
    return this.getData(ref);
  }

  async update(path, data) {
    const ref = await this.getRef(path);

    if (isCollection(ref)) {
      throw new Error("Can't use .update on a collection; specify an ID");
    }

    await ref.update(data);
    return this.getData(ref);
  }
}
