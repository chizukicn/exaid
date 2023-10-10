const baseTypes = ["string", "number", "object", "boolean", "array", "any", "void", "undefined", "null"];

const typeMap: Record<string, string> = {
  integer: "number",
  bigdecimal: "number",
  decimal: "number",
  float: "number",
  double: "number",
  date: "string",
  int: "number",
  List: "array",
  Map: "Record",
  Set: "array",
  file: "File",
  String: "string",
  Array: "array",
  Void: "void"
};

export interface Type {
  name: string
  generics: Type[]
  toString(): string
}

function splitGeneric(type: string) {
  const generic: string[] = [];
  let start = 0;
  let isGeneric = false;
  for (let end = 0; end < type.length; end++) {
    switch (type[end]) {
      case "<":
        isGeneric = true;
        break;
      case ">":
        isGeneric = false;
        break;
      case ",":
        if (!isGeneric) {
          generic.push(type.slice(start, end));
          start = end + 1;
        }
        break;
    }
  }
  if (start < type.length) {
    generic.push(type.slice(start));
  }
  return generic;
}

export function getType(type: string = "any", generics: string[] = []): Type {
  if (!baseTypes.includes(type)) {
    type = type.replaceAll(/«/g, "<").replaceAll(/»/g, ">");
  }
  let name = type;

  let generic: Type[] = generics.map(g => getType(g));

  if (type.endsWith("[]")) {
    const genericType = getType(type.slice(0, -2));
    name = "array";
    generic = [genericType];
  } else {
    const startIndex = type.indexOf("<");
    const endIndex = type.lastIndexOf(">");
    if (startIndex > -1) {
      name = type.slice(0, startIndex);
      if (endIndex > -1) {
        type = type.slice(startIndex + 1, endIndex);
        generic = splitGeneric(type).map(e => getType(e));
      }
    }

    name = typeMap[name] ?? name;
  }

  return {
    name,
    generics: generic,
    toString() {
      if (name === "array") {
        return `${generic[0]?.toString() ?? "any"}[]`;
      }
      return generic.length > 0 ? `${name}<${generic.map(e => e.toString()).join(",")}>` : name;
    }
  };
}

export function getExternalType(param: string | Type, lib: string[] = []): string[] {
  const type = typeof param === "string" ? getType(param) : param;
  const types: string[] = [];
  if (!lib.includes(type.name) && !baseTypes.includes(type.name)) {
    types.push(type.name);
  }
  if (type.generics.length) {
    type.generics.forEach(e => types.push(...getExternalType(e, lib)));
  }
  return types;
}
